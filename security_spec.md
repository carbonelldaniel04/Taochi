# Security Specification - TAO-CHI Servicio Integral

## 1. Data Invariants
- **Works (Galería de Obras):** Only authorized administrators can create, update, or delete project records. Titles, image URLs, and categories are required and strictly checked for types and length bounds.
- **Testimonials (Clientes Felices):** Anyone can read testmionials, but only administrators can add and verify them. Ratings must strictly range from 1 to 5 stars.
- **WebContent:** Web layout contents (banners, numbers, hero details) are readable by the public, but writable only by the verified administrator.
- **BudgetRequest (Presupuestos):** Any public user can submit a budget inquiry, but they are forbidden from modifying or reading others' inquiries. Only verified admins can list, update the treatment status (Pendiente, En Contacto, etc.), and append administrative notes.

---

## 2. The "Dirty Dozen" Malicious Payloads

### Payload 1: Unauthorized Work Insertion (Identity Spoofing)
- **Target:** `/works/{id}` (Create)
- **Attacker:** Unauthenticated user
```json
{
  "title": "Hack-Proof Steel Frame",
  "imageUrl": "http://malicious.com/exploit.jpg",
  "category": "Viviendas"
}
```
- **Expectation:** `PERMISSION_DENIED`

### Payload 2: Work Creation with Ghost Field (Shadow Update / Value Poisoning)
- **Target:** `/works/{id}` (Create)
- **Attacker:** Valid user but malicious payload containing undocumented fields
```json
{
  "title": "Premium Villa",
  "imageUrl": "https://images.unsplash.com/photo-1",
  "category": "Viviendas",
  "system_override": true,
  "hacked": "Yes"
}
```
- **Expectation:** `PERMISSION_DENIED` (Strict schema block via key-size and exact properties verification helper)

### Payload 3: Invalid Category Poisoning
- **Target:** `/works/{id}` (Create by Admin)
- **Payload:** Invalid category value
```json
{
  "title": "Invalid Category House",
  "imageUrl": "https://images.unsplash.com/photo-1",
  "category": "HackerSpace"
}
```
- **Expectation:** `PERMISSION_DENIED` (Strict enum validation fails)

### Payload 4: PII Siphoning (Blanket List Reads on Budget Requests)
- **Query:** `getDocs(collection(db, 'budgetRequests'))`
- **Attacker:** Authenticated non-admin client
- **Expectation:** `PERMISSION_DENIED` (Forbidding `allow list: if isSignedIn()` without resource-side filters or restricting read strictly to `isAdmin()`).

### Payload 5: Budget Status Spoofing (State Shortcutting)
- **Target:** `/budgetRequests/{id}` (Create)
- **Attacker:** Guest trying to insert a message pre-marked as "Presupuestado" or "Rechazado"
```json
{
  "nombre": "Estafador",
  "telefono": "+5411223344",
  "email": "scam@gmail.com",
  "localidad": "CABA",
  "mensaje": "Quiero robar",
  "status": "Presupuestado",
  "createdAt": "2026-06-11T12:00:00Z"
}
```
- **Expectation:** Client can compose but only with `status == "Pendiente"`. Wait, we will enforce that guest creators can only write `status == "Pendiente"`.

### Payload 6: Budget Write Bypass (ID Poisoning/Junk Character Insertion)
- **Target:** `/budgetRequests/VERY_LONG_JUNK_ID_SPAM_ATTACK_1234567890_JUNK_JUNK...`
- **Attacker:** Bot spammer inserting a 5KB path identifier to bloat Firestore storage costs
- **Expectation:** `PERMISSION_DENIED` (Checks `isValidId()` ensuring the path parameter size is `<= 128` and consists of alphanumeric/dash characters).

### Payload 7: Denial of Wallet (Giant String field)
- **Target:** `/budgetRequests/{id}` (Create)
- **Attacker:** bot writing 10MB of characters into the message body
- **Expectation:** `PERMISSION_DENIED` (Checks `mensaje.size() <= 2000`)

### Payload 8: Self-Assigned Administrator Promotion
- **Target:** `/admins/{auth.uid}` (Create/Write)
- **Attacker:** Self-registering user attempting to set themselves as Admin
```json
{
  "email": "hacker@domain.com",
  "role": "admin"
}
```
- **Expectation:** `PERMISSION_DENIED` (Strictly blocks writes to `/admins` collection)

### Payload 9: Non-verified Email Account Login Bypass
- **Target:** `/works/{id}` (Write)
- **Attacker:** Email is spoofed as `carbonelldaniel04@gmail.com` but `email_verified` is FALSE.
- **Expectation:** `PERMISSION_DENIED` (Strictly checks `request.auth.token.email_verified == true`)

### Payload 10: Testimonial Spoofing with Ridiculous Rating
- **Target:** `/testimonials/{id}` (Create)
- **Attacker:** Guest trying to inject testimonial with a rating of `1000` stars.
- **Expectation:** `PERMISSION_DENIED` (Check `data.rating >= 1 && data.rating <= 5`)

### Payload 11: WebContent Structure Poisoning
- **Target:** `/webContent/site` (Update)
- **Attacker:** Stranger attempting to modify contact phone numbers or headers
- **Expectation:** `PERMISSION_DENIED` (Allowed only for `isAdmin()`)

### Payload 12: Updating Immutable Create Timestamp (Immortal Field Rule)
- **Target:** `/works/{id}` (Update)
- **Attacker:** Admin attempting to change a historical `createdAt` date.
- **Expectation:** `PERMISSION_DENIED` (Checks `incoming().createdAt == existing().createdAt` on update)

---

## 3. Simulated Test Runner (firestore.rules.test.ts)

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('TAO-CHI Security Rules Suite', () => {
  let testEnv: any;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'pivotal-tribute-g8gvj',
      firestore: {
        rules: require('fs').readFileSync('firestore.rules', 'utf8')
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('blocks unauthenticated user from adding a Work project', async () => {
    const context = testEnv.unauthenticatedContext();
    const service = context.firestore();
    await assertFails(service.collection('works').add({
      title: 'Hacked Building',
      imageUrl: 'http://evil.com/img.jpg',
      category: 'Viviendas'
    }));
  });

  it('blocks non-verified admin emails from administrative write operations', async () => {
    const context = testEnv.authenticatedContext('hacker_uid', {
      email: 'carbonelldaniel04@gmail.com',
      email_verified: false
    });
    const service = context.firestore();
    await assertFails(service.collection('works').doc('test-work').set({
      title: 'Hacked Building',
      imageUrl: 'https://images.unsplash.com/photo-1',
      category: 'Viviendas'
    }));
  });

  it('allows verified admin to manage works', async () => {
    const context = testEnv.authenticatedContext('admin_uid', {
      email: 'carbonelldaniel04@gmail.com',
      email_verified: true
    });
    const service = context.firestore();
    await assertSucceeds(service.collection('works').doc('valid-id').set({
      title: 'Real Premium Home',
      imageUrl: 'https://images.unsplash.com/photo-1',
      category: 'Viviendas',
      featured: true,
      createdAt: '2026-06-11T12:00:00Z'
    }));
  });

  it('allows anyone to submit budget inquiry but status must be Pendiente', async () => {
    const context = testEnv.unauthenticatedContext();
    const service = context.firestore();
    // Valid submission
    await assertSucceeds(service.collection('budgetRequests').doc('new-inquiry').set({
      nombre: 'Juan Pérez',
      telefono: '1122334455',
      email: 'juan@perez.com',
      localidad: 'Luján',
      mensaje: 'Hola, quiero construir una casa',
      status: 'Pendiente',
      createdAt: '2026-06-11T12:00:00Z'
    }));
  });
});
```
