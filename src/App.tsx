/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Building, Home, Hammer, Key, Star, Menu, X, LogIn, LogOut, Plus, 
  Trash, Edit2, Check, ExternalLink, FileText, Database, 
  Sliders, Download, Phone, Instagram, ShieldAlert, Wrench, RefreshCw, Eye,
  Sparkles, MessageSquare, Send, Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, onSnapshot, query, orderBy 
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initSecondaryApp, deleteApp } from 'firebase/app';
import { getAuth as getSecondaryAuth, createUserWithEmailAndPassword as createSecondaryUser } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { db, auth, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { Work, Testimonial, WebContent, BudgetRequest } from './types';
import { INITIAL_WORKS, INITIAL_TESTIMONIALS, INITIAL_WEB_CONTENT } from './seedData';

export default function App() {
  // Navigation & View Toggles
  const [isAdminView, setIsAdminView] = useState<boolean>(false);
  const [activeAdminTab, setActiveAdminTab] = useState<"works" | "testimonials" | "content" | "budgets" | "personnel">("works");
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // General App State
  const [works, setWorks] = useState<Work[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [deletedWorkIds, setDeletedWorkIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("deleted_work_ids");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [deletedTestimonialIds, setDeletedTestimonialIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("deleted_testimonial_ids");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [webContent, setWebContent] = useState<WebContent>(INITIAL_WEB_CONTENT);
  const [budgets, setBudgets] = useState<BudgetRequest[]>([]);
  
  // Auth & Admin configuration
  const [user, setUser] = useState<any>(null);
  const [isRealAdmin, setIsRealAdmin] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true); // Default to live local test-drive
  const [dbLoading, setDbLoading] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<"synced" | "local" | "error">("local");

  // Interaction States
  const [workFilter, setWorkFilter] = useState<string>("Todas");
  const [selectedWorkImage, setSelectedWorkImage] = useState<string | null>(null);
  
  // Contact Form Inputs
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactLocalidad, setContactLocalidad] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // AI Chat Bot Integration States
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "bot"; text: string; time: string }>>([
    {
      sender: "bot",
      text: "¡Hola! Bienvenido a TAO-CHI Servicio Integral en Argentina. Soy tu asesor de inteligencia artificial especializado en Steel Frame. ¿Qué tipo de obra (vivienda, ampliación, remodelación) estás pensando realizar?",
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [userChatInput, setUserChatInput] = useState<string>("");
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-schedule scroll to bottom on chatbot expansion or incoming messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatOpen]);

  // Handler for posting to server full-stack /api/n8n-chat
  const handleSendChatMessage = async (presetText?: string) => {
    const textToSend = presetText || userChatInput;
    if (!textToSend.trim() || chatLoading) return;

    const currentTimeStamp = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const userMsg = {
      sender: "user" as const,
      text: textToSend,
      time: currentTimeStamp
    };

    setChatMessages(prev => [...prev, userMsg]);
    if (!presetText) setUserChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/n8n-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: textToSend,
          history: chatMessages.map(msg => ({ sender: msg.sender, text: msg.text })),
          n8nWebhookUrl: displayWebContent.n8nWebhookUrl || "",
          aiSystemInstruction: displayWebContent.aiSystemInstruction || ""
        })
      });

      if (!response.ok) {
        throw new Error("API Route failure");
      }

      const data = await response.json();
      const botTimeStamp = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

      setChatMessages(prev => [...prev, {
        sender: "bot" as const,
        text: data.response || "No logré capturar tu consulta. ¿Me la repites por favor?",
        time: botTimeStamp
      }]);
    } catch (err) {
      console.error("Error consultando la IA / n8n webhook:", err);
      const errorMsgTimeStamp = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      setChatMessages(prev => [...prev, {
        sender: "bot" as const,
        text: "Parece que hay una interrupción temporal de red en la IA. Te sugiero usar nuestra línea de WhatsApp directa tocando el botón del extremo opuesto para atención instantánea.",
        time: errorMsgTimeStamp
      }]);
    } finally {
      setChatLoading(false);
    }
  };
  
  // Custom Login & Personnel management states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [adminList, setAdminList] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Login handler
  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Por favor ingrese su email y contraseña.");
      return;
    }
    setLoginLoading(true);
    setLoginError("");
    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      const currentUser = userCredential.user;
      
      // Check admin status
      const hasAdminEmail = currentUser.email === "carbonelldaniel04@gmail.com";
      let isVerified = hasAdminEmail;
      
      if (!isVerified) {
        const adminDocRef = doc(db, 'admins', currentUser.uid);
        const adminDocSnap = await getDoc(adminDocRef);
        if (adminDocSnap.exists()) {
          isVerified = true;
        }
      }
      
      if (!isVerified) {
        setLoginError("Acceso denegado: El usuario no está registrado como personal de la empresa.");
        await logout(); // Sign out right away
      } else {
        setLoginEmail("");
        setLoginPassword("");
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      let errMsg = "Credenciales incorrectas o error de conexión.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        errMsg = "El email o la contraseña son incorrectos. Verifique sus datos.";
      } else if (err.code === "auth/invalid-email") {
        errMsg = "El formato del correo electrónico es inválido.";
      }
      setLoginError(errMsg);
    } finally {
      setLoginLoading(false);
    }
  };

  // Fetch administrator list
  const fetchAdminList = async () => {
    if (!isRealAdmin) return;
    setLoadingAdmins(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'admins'));
      const list: any[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setAdminList(list);
    } catch (e) {
      console.error("Error fetching administrators list:", e);
      handleFirestoreError(e, OperationType.LIST, "admins");
    } finally {
      setLoadingAdmins(false);
    }
  };

  // Trigger loading admins when tab switches to 'personnel' or admin is loaded
  useEffect(() => {
    if (isRealAdmin && (activeAdminTab as string) === "personnel") {
      fetchAdminList();
    }
  }, [isRealAdmin, activeAdminTab]);

  // Administrative Editors & Forms Inputs
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [newWork, setNewWork] = useState<Partial<Work>>({
    title: '', description: '', category: 'Viviendas', imageUrl: '', location: '', date: '', featured: false
  });

  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
  const [newTestimonial, setNewTestimonial] = useState<Partial<Testimonial>>({
    name: '', review: '', rating: 5, projectTitle: '', photoUrl: '', videoUrl: ''
  });

  // Public Client Testimonial Inputs
  const [clientName, setClientName] = useState('');
  const [clientReview, setClientReview] = useState('');
  const [clientRating, setClientRating] = useState(5);
  const [clientProjectTitle, setClientProjectTitle] = useState('');
  const [clientPhotoUrl, setClientPhotoUrl] = useState('');
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);
  const [clientSubmitSuccess, setClientSubmitSuccess] = useState(false);

  const [editContent, setEditContent] = useState<WebContent>(INITIAL_WEB_CONTENT);
  const [budgetStatusComment, setBudgetStatusComment] = useState<{id: string, notes: string}>({id: '', notes: ''});

  // Track Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const hasAdminEmail = currentUser.email === "carbonelldaniel04@gmail.com";
        if (hasAdminEmail) {
          setIsRealAdmin(true);
          setIsDemoMode(false);
        } else {
          try {
            const adminDocRef = doc(db, 'admins', currentUser.uid);
            const adminDocSnap = await getDoc(adminDocRef);
            if (adminDocSnap.exists()) {
              setIsRealAdmin(true);
              setIsDemoMode(false);
            } else {
              setIsRealAdmin(false);
              setIsDemoMode(true);
            }
          } catch (e) {
            console.warn("User is not registered in the admins collection:", e);
            setIsRealAdmin(false);
            setIsDemoMode(true);
          }
        }
      } else {
        setIsRealAdmin(false);
        setIsDemoMode(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Firestore Database collections
  useEffect(() => {
    setDbLoading(true);
    let unsubWorks = () => {};
    let unsubTestimonials = () => {};
    let unsubContent = () => {};
    let unsubBudgets = () => {};

    if (isDemoMode) {
      // 1. Works Simulation
      const savedWorks = localStorage.getItem("simulated_works");
      if (savedWorks) {
        try {
          setWorks(JSON.parse(savedWorks));
        } catch (e) {
          console.error("Failed to parse simulated works:", e);
          setWorks(INITIAL_WORKS);
        }
      } else {
        setWorks(INITIAL_WORKS);
      }

      // 2. Testimonials Simulation
      const savedTestimonials = localStorage.getItem("simulated_testimonials");
      if (savedTestimonials) {
        try {
          setTestimonials(JSON.parse(savedTestimonials));
        } catch (e) {
          console.error("Failed to parse simulated testimonials:", e);
          setTestimonials(INITIAL_TESTIMONIALS);
        }
      } else {
        setTestimonials(INITIAL_TESTIMONIALS);
      }

      // 3. WebContent Simulation
      const savedContent = localStorage.getItem("simulated_webContent");
      if (savedContent) {
        try {
          const parsed = JSON.parse(savedContent);
          setWebContent(parsed);
          setEditContent(parsed);
        } catch (e) {
          console.error("Failed to parse simulated webContent:", e);
          setWebContent(INITIAL_WEB_CONTENT);
          setEditContent(INITIAL_WEB_CONTENT);
        }
      } else {
        setWebContent(INITIAL_WEB_CONTENT);
        setEditContent(INITIAL_WEB_CONTENT);
      }

      // 4. Budgets Simulation
      const savedBudgets = localStorage.getItem("simulated_budgets");
      if (savedBudgets) {
        try {
          setBudgets(JSON.parse(savedBudgets).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt)));
        } catch (e) {
          console.error("Failed to parse simulated budgets:", e);
          setBudgets([]);
        }
      } else {
        setBudgets([]);
      }

      setSyncStatus("local");
      setDbLoading(false);
    } else {
      try {
        // 1. Works Realtime Stream
        const qWorks = query(collection(db, 'works'));
        unsubWorks = onSnapshot(qWorks, (snapshot) => {
          const fetched: Work[] = [];
          snapshot.forEach((doc) => {
            fetched.push({ id: doc.id, ...doc.data() } as Work);
          });
          setWorks(fetched);
          setSyncStatus("synced");
        }, (err) => {
          console.warn("Using local seed for works (Firestore connection pending or offline):", err);
          setWorks(INITIAL_WORKS);
        });

        // 2. Testimonials Realtime Stream
        const qTestimonials = query(collection(db, 'testimonials'));
        unsubTestimonials = onSnapshot(qTestimonials, (snapshot) => {
          const fetched: Testimonial[] = [];
          snapshot.forEach((doc) => {
            fetched.push({ id: doc.id, ...doc.data() } as Testimonial);
          });
          setTestimonials(fetched);
        }, (err) => {
          console.warn("Using local seed for testimonials:", err);
          setTestimonials(INITIAL_TESTIMONIALS);
        });

        // 3. WebContent Stream
        const qContent = query(collection(db, 'webContent'));
        unsubContent = onSnapshot(qContent, (snapshot) => {
          if (!snapshot.empty) {
            // Take first document 'site'
            const mainDoc = snapshot.docs[0];
            setWebContent({ ...mainDoc.data() } as WebContent);
            setEditContent({ ...mainDoc.data() } as WebContent);
          } else {
            setWebContent(INITIAL_WEB_CONTENT);
            setEditContent(INITIAL_WEB_CONTENT);
          }
        }, (err) => {
          console.warn("Using local seed for webContent:", err);
          setWebContent(INITIAL_WEB_CONTENT);
          setEditContent(INITIAL_WEB_CONTENT);
        });

        // 4. BudgetRequests Stream
        if (isRealAdmin) {
          const qBudgets = query(collection(db, 'budgetRequests'));
          unsubBudgets = onSnapshot(qBudgets, (snapshot) => {
            const fetched: BudgetRequest[] = [];
            snapshot.forEach((doc) => {
              fetched.push({ id: doc.id, ...doc.data() } as BudgetRequest);
            });
            // Protect against duplicates dynamically
            const seenIds = new Set<string>();
            const uniqueFetched = fetched.filter(b => {
              if (!b.id) return true;
              if (seenIds.has(b.id)) return false;
              seenIds.add(b.id);
              return true;
            });
            setBudgets(uniqueFetched.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
          }, (err) => {
            console.warn("Budget list restricted to administrator credentials.", err);
          });
        } else {
          // Fallback to local storage for demo/simulation mode
          const saved = localStorage.getItem("simulated_budgets");
          if (saved) {
            try {
              setBudgets(JSON.parse(saved).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt)));
            } catch (e) {
              console.error("Failed to parse simulated budgets:", e);
              setBudgets([]);
            }
          } else {
            setBudgets([]);
          }
        }

        setDbLoading(false);
      } catch (e) {
        console.error("Failed to connect to Firebase Firestore:", e);
        setDbLoading(false);
        setSyncStatus("local");
      }
    }

    return () => {
      unsubWorks();
      unsubTestimonials();
      unsubContent();
      unsubBudgets();
    };
  }, [user, isRealAdmin, isDemoMode]);

  // Combine live Firestore documents with Initial Seed items with strict deduplication to prevent any duplicate works or testimonials
  const displayWorks = (() => {
    const uniqueWorks: Work[] = [];
    const seenIds = new Set<string>();
    const seenTitles = new Set<string>();

    const addWork = (w: Work) => {
      const id = w.id;
      const titleClean = (w.title || '').trim().toLowerCase();
      if (!id || deletedWorkIds.includes(id)) return;
      if (seenIds.has(id) || (titleClean && seenTitles.has(titleClean))) return;

      seenIds.add(id);
      if (titleClean) seenTitles.add(titleClean);
      uniqueWorks.push(w);
    };

    // Live or simulated custom works take precedence
    works.forEach(addWork);
    // Seeded fallback works fill the rest
    INITIAL_WORKS.forEach(addWork);

    return uniqueWorks;
  })();

  const filteredWorks = displayWorks.filter(w => workFilter === "Todas" || w.category === workFilter);

  const displayTestimonials = (() => {
    const uniqueTestimonials: Testimonial[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    const addTestimonial = (t: Testimonial) => {
      const id = t.id;
      const nameClean = (t.name || '').trim().toLowerCase();
      if (!id || deletedTestimonialIds.includes(id)) return;
      if (seenIds.has(id) || (nameClean && seenNames.has(nameClean))) return;

      seenIds.add(id);
      if (nameClean) seenNames.add(nameClean);
      uniqueTestimonials.push(t);
    };

    // Live or simulated custom testimonials take precedence
    testimonials.forEach(addTestimonial);
    // Seeded fallback templates fill the rest
    INITIAL_TESTIMONIALS.forEach(addTestimonial);

    return uniqueTestimonials;
  })();

  const displayWebContent = webContent;

  const activePromoWorks = displayWorks.filter(w => w.featured);

  // Budget submission handler
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactPhone || !contactEmail || !contactLocalidad || !contactMessage) {
      alert("Por favor completa todos los campos requeridos.");
      return;
    }

    setFormSubmitting(true);
    const budgetId = `budget_${Date.now()}`;
    const newRequest: BudgetRequest = {
      nombre: contactName,
      telefono: contactPhone,
      email: contactEmail,
      localidad: contactLocalidad,
      mensaje: contactMessage,
      status: "Pendiente",
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Always attempt saving to the live Cloud Firestore database
      let savedToCloud = false;
      try {
        await setDoc(doc(db, 'budgetRequests', budgetId), newRequest);
        savedToCloud = true;
      } catch (dbErr) {
        console.warn("Could not save to Cloud Firestore (offline or pending setup):", dbErr);
      }

      // 2. Always persist in localStorage to make sure it is instantly visible in demo/simulation admin mode
      const saved = localStorage.getItem("simulated_budgets");
      const list = saved ? JSON.parse(saved) : [];
      if (!list.some((b: any) => b.id === budgetId)) {
        list.push({ ...newRequest, id: budgetId });
        localStorage.setItem("simulated_budgets", JSON.stringify(list));
      }

      // 3. Keep the local state updated responsively, avoiding duplicates
      setBudgets((prev) => {
        if (prev.some((b) => b.id === budgetId)) {
          return prev;
        }
        return [{ ...newRequest, id: budgetId }, ...prev];
      });
      
      setFormSuccess(true);
      setContactName("");
      setContactPhone("");
      setContactEmail("");
      setContactLocalidad("");
      setContactMessage("");
    } catch (error) {
      console.error("Budget save error:", error);
      handleFirestoreError(error, OperationType.WRITE, `budgetRequests/${budgetId}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Seeding trigger
  const handleSeedDatabase = async () => {
    if (!isRealAdmin) {
      alert("Iniciá sesión como el administrador oficial en carbonelldaniel04@gmail.com para persistir en la nube.");
      return;
    }
    try {
      setDbLoading(true);
      for (const w of INITIAL_WORKS) {
        await setDoc(doc(db, 'works', w.id || `work_${Date.now()}_${Math.random()}`), w);
      }
      for (const t of INITIAL_TESTIMONIALS) {
        await setDoc(doc(db, 'testimonials', t.id || `testimonial_${Date.now()}`), t);
      }
      await setDoc(doc(db, 'webContent', 'site'), INITIAL_WEB_CONTENT);
      alert("¡Base de datos Firestore sembrada con éxito en la nube!");
    } catch (e) {
      alert("Error sembrando la base de datos debido a permisos de seguridad: " + e);
    } finally {
      setDbLoading(false);
    }
  };

  // Helper to ensure dates are cleanly normalized to ISO Strings, preventing Firestore rules errors with mixed objects/timestamps
  const normalizeToISOString = (val: any): string => {
    if (!val) return new Date().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'object') {
      if (typeof val.seconds === 'number') {
        return new Date(val.seconds * 1000).toISOString();
      }
      if (typeof val.toDate === 'function') {
        return val.toDate().toISOString();
      }
    }
    return String(val);
  };

  // Admin Actions: CREATE / UPDATE Work
  const handleSaveWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWork.title || !newWork.imageUrl) {
      alert("Completar título e imagen obligatorios.");
      return;
    }

    const workId = editingWork ? editingWork.id! : `work_${Date.now()}`;
    const payload: Work = {
      title: newWork.title,
      description: newWork.description || '',
      imageUrl: newWork.imageUrl,
      videoUrl: newWork.videoUrl || '',
      category: (newWork.category as any) || 'Viviendas',
      location: newWork.location || '',
      date: newWork.date || '',
      featured: !!newWork.featured,
      createdAt: normalizeToISOString(editingWork?.createdAt)
    };

    try {
      if (isRealAdmin) {
        await setDoc(doc(db, 'works', workId), payload);
      } else {
        // Seed local simulator
        const baseList = works.length > 0 ? works : INITIAL_WORKS;
        const updatedList = editingWork 
          ? baseList.map(w => w.id === workId ? { ...payload, id: workId } : w)
          : [...baseList, { ...payload, id: workId }];
        setWorks(updatedList);
        localStorage.setItem("simulated_works", JSON.stringify(updatedList));
      }
      
      // Remove from deletedWorkIds tracking if overridden or re-saved
      if (deletedWorkIds.includes(workId)) {
        const remaining = deletedWorkIds.filter(id => id !== workId);
        setDeletedWorkIds(remaining);
        localStorage.setItem("deleted_work_ids", JSON.stringify(remaining));
      }
      
      setNewWork({ title: '', description: '', category: 'Viviendas', imageUrl: '', location: '', date: '', featured: false });
      setEditingWork(null);
      alert(editingWork ? "Obra actualizada" : "Obra creada exitosamente");
    } catch (e: any) {
      console.error(e);
      alert("Firestore denegó la operación. Detalle: " + (e?.message || String(e)));
    }
  };

  const handleDeleteWork = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar esta obra?")) return;
    try {
      if (isRealAdmin) {
        await deleteDoc(doc(db, 'works', id));
      } else {
        const baseList = works.length > 0 ? works : INITIAL_WORKS;
        const updatedList = baseList.filter(w => w.id !== id);
        setWorks(updatedList);
        localStorage.setItem("simulated_works", JSON.stringify(updatedList));
      }
      
      // Keep local track of deleted works (vital for empty or fallback database states)
      const newDeleted = [...deletedWorkIds, id];
      setDeletedWorkIds(newDeleted);
      localStorage.setItem("deleted_work_ids", JSON.stringify(newDeleted));
      
      alert("Obra eliminada.");
    } catch (e: any) {
      console.error(e);
      alert("Firestore denegó la operación de eliminación. Detalle: " + (e?.message || String(e)));
    }
  };

  // Admin Actions: CREATE / UPDATE Testimonials
  const handleSaveTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTestimonial.name || !newTestimonial.review) {
      alert("Completar nombre y reseña obligatorios.");
      return;
    }

    const testId = editingTestimonial ? editingTestimonial.id! : `testimonial_${Date.now()}`;
    const payload: Testimonial = {
      name: newTestimonial.name,
      review: newTestimonial.review,
      rating: Number(newTestimonial.rating) || 5,
      projectTitle: newTestimonial.projectTitle || '',
      photoUrl: newTestimonial.photoUrl || '',
      videoUrl: newTestimonial.videoUrl || '',
      createdAt: normalizeToISOString(editingTestimonial?.createdAt)
    };

    try {
      if (isRealAdmin) {
        await setDoc(doc(db, 'testimonials', testId), payload);
      } else {
        const baseList = testimonials.length > 0 ? testimonials : INITIAL_TESTIMONIALS;
        const updatedList = editingTestimonial 
          ? baseList.map(t => t.id === testId ? { ...payload, id: testId } : t)
          : [...baseList, { ...payload, id: testId }];
        setTestimonials(updatedList);
        localStorage.setItem("simulated_testimonials", JSON.stringify(updatedList));
      }

      // Remove from deletedTestimonialIds tracking if overridden or re-saved
      if (deletedTestimonialIds.includes(testId)) {
        const remaining = deletedTestimonialIds.filter(id => id !== testId);
        setDeletedTestimonialIds(remaining);
        localStorage.setItem("deleted_testimonial_ids", JSON.stringify(remaining));
      }

      setNewTestimonial({ name: '', review: '', rating: 5, projectTitle: '', photoUrl: '', videoUrl: '' });
      setEditingTestimonial(null);
      alert(editingTestimonial ? "Testimonio actualizado" : "Testimonio agregado exitosamente");
    } catch (e) {
      alert("Falló guardado de testimonio: " + e);
    }
  };

  const handleDeleteTestimonial = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar este testimonio?")) return;
    try {
      if (isRealAdmin) {
        await deleteDoc(doc(db, 'testimonials', id));
      } else {
        const baseList = testimonials.length > 0 ? testimonials : INITIAL_TESTIMONIALS;
        const updatedList = baseList.filter(t => t.id !== id);
        setTestimonials(updatedList);
        localStorage.setItem("simulated_testimonials", JSON.stringify(updatedList));
      }
      
      // Keep local track of deleted testimonials (vital for empty or fallback database states)
      const newDeleted = [...deletedTestimonialIds, id];
      setDeletedTestimonialIds(newDeleted);
      localStorage.setItem("deleted_testimonial_ids", JSON.stringify(newDeleted));
      
      alert("Testimonio eliminado.");
    } catch (e) {
      alert("No se pudo borrar el testimonio.");
    }
  };

  // Client Actions: Public Testimonial Submission
  const handleClientSubmitTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientReview.trim()) {
      alert("Por favor, ingresá tu nombre y tu opinión.");
      return;
    }

    const testId = `testimonial_client_${Date.now()}`;
    const payload: Testimonial = {
      name: clientName.trim(),
      review: clientReview.trim(),
      rating: Number(clientRating) || 5,
      projectTitle: clientProjectTitle.trim() || 'Cliente Satisfecho',
      photoUrl: clientPhotoUrl.trim() || '',
      videoUrl: '',
      createdAt: new Date().toISOString()
    };

    try {
      try {
        await setDoc(doc(db, 'testimonials', testId), payload);
      } catch (dbErr) {
        console.warn("Could not save to live database, updating local simulated storage:", dbErr);
      }

      // Always update local state instantly
      const baseList = testimonials.length > 0 ? testimonials : INITIAL_TESTIMONIALS;
      const updatedList = [...baseList, { ...payload, id: testId }];
      setTestimonials(updatedList);
      localStorage.setItem("simulated_testimonials", JSON.stringify(updatedList));

      // Reset form
      setClientName('');
      setClientReview('');
      setClientRating(5);
      setClientProjectTitle('');
      setClientPhotoUrl('');
      setClientSubmitSuccess(true);
      setIsClientFormOpen(false);
      
      setTimeout(() => {
        setClientSubmitSuccess(false);
      }, 5000);

      alert("¡Muchas gracias por tu opinión! Se ha publicado con éxito.");
    } catch (err: any) {
      alert("No se pudo publicar la opinión: " + (err?.message || String(err)));
    }
  };

  // Admin Actions: Web Content Editor
  const handleSaveWebContent = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanContent: WebContent = {
      heroHeadline: editContent.heroHeadline || "",
      heroSubheadline: editContent.heroSubheadline || "",
      heroVideoUrl: editContent.heroVideoUrl || "",
      heroImageUrl: editContent.heroImageUrl || "",
      heroType: editContent.heroType || "image",
      aboutText: editContent.aboutText || "",
      whatsappNumber: editContent.whatsappNumber || "",
      whatsappMessage: editContent.whatsappMessage || "",
      instagramUrl: editContent.instagramUrl || "",
      n8nWebhookUrl: editContent.n8nWebhookUrl || "",
      aiSystemInstruction: editContent.aiSystemInstruction || "",
      statsCompletedWorks: editContent.statsCompletedWorks || "100+",
      statsYearsExperience: editContent.statsYearsExperience || "15+",
      statsSatisfiedClients: editContent.statsSatisfiedClients || "100%",
    };

    try {
      if (isRealAdmin) {
        await setDoc(doc(db, 'webContent', 'site'), cleanContent);
        setWebContent(cleanContent);
        setEditContent(cleanContent);
      } else {
        setWebContent(cleanContent);
        setEditContent(cleanContent);
        localStorage.setItem("simulated_webContent", JSON.stringify(cleanContent));
      }
      alert("Contenido del sitio actualizado en tiempo real.");
    } catch (err: any) {
      console.error("Error saving web content:", err);
      alert("No se pudo actualizar el contenido: " + (err?.message || String(err)));
    }
  };

  // Admin Actions: Budget Request status change & notes update
  const handleUpdateBudgetStatus = async (id: string, nextStatus: any) => {
    try {
      if (isRealAdmin) {
        await updateDoc(doc(db, 'budgetRequests', id), { status: nextStatus });
      } else {
        const updated = budgets.map(b => b.id === id ? { ...b, status: nextStatus } : b);
        setBudgets(updated);
        localStorage.setItem("simulated_budgets", JSON.stringify(updated));
      }
    } catch (e) {
      alert("No tienes rol administrativo en la nube para actualizar estados.");
    }
  };

  const handleSaveBudgetNotes = async (id: string) => {
    if (budgetStatusComment.id !== id) return;
    try {
      if (isRealAdmin) {
        await updateDoc(doc(db, 'budgetRequests', id), { notes: budgetStatusComment.notes });
      } else {
        const updated = budgets.map(b => b.id === id ? { ...b, notes: budgetStatusComment.notes } : b);
        setBudgets(updated);
        localStorage.setItem("simulated_budgets", JSON.stringify(updated));
      }
      alert("Comentario administrativo grabado.");
      setBudgetStatusComment({ id: '', notes: '' });
    } catch (e) {
      alert("No se pudieron añadir notas.");
    }
  };

  // Create a new Administrator (personnel) using secondary firebase app to avoid logging out active session
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminName.trim() || !newAdminEmail.trim() || !newAdminPassword.trim()) {
      alert("Por favor complete todos los campos obligatorios.");
      return;
    }
    if (newAdminPassword.length < 6) {
      alert("La contraseña debe tener un mínimo de 6 caracteres.");
      return;
    }

    setCreatingAdmin(true);
    let secondaryApp;
    try {
      // 1. Initialize a temporary secondary client app
      const appName = `temp-app-${Date.now()}`;
      secondaryApp = initSecondaryApp(firebaseConfig, appName);
      const secondaryAuth = getSecondaryAuth(secondaryApp);

      // 2. Register the employee in Firebase Auth
      const userCredential = await createSecondaryUser(secondaryAuth, newAdminEmail, newAdminPassword);
      const newUid = userCredential.user.uid;

      // 3. Save details into Firestore 'admins' database
      await setDoc(doc(db, 'admins', newUid), {
        name: newAdminName,
        email: newAdminEmail,
        role: "admin",
        createdAt: new Date().toISOString(),
        addedBy: user?.email || "carbonelldaniel04@gmail.com"
      });

      alert(`Administrador "${newAdminName}" registrado con éxito.`);
      setNewAdminName("");
      setNewAdminEmail("");
      setNewAdminPassword("");
      fetchAdminList();
    } catch (err: any) {
      console.error("Failed to register new administrator:", err);
      let errMsg = err.message || JSON.stringify(err);
      if (err.code === "auth/email-already-in-use") {
        errMsg = "El correo electrónico ya se encuentra registrado.";
      } else if (err.code === "auth/operation-not-allowed") {
        errMsg = "El proveedor de inicio de sesión por 'Correo electrónico / contraseña' está desactivado en tu proyecto Firebase. Para solucionarlo:\n\n1. Ingresa a la consola de Firebase (https://console.firebase.google.com/)\n2. Ve a la sección 'Authentication' (Autenticación).\n3. Selecciona la pestaña 'Sign-in method' (Método de inicio de sesión).\n4. Haz clic en 'Agregar nuevo proveedor' y selecciona 'Correo electrónico/contraseña'.\n5. Actívalo y haz clic en Guardar.";
      }
      alert("Error al registrar administrador:\n\n" + errMsg);
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (e) {
          console.error("Error deleting secondary application instance:", e);
        }
      }
      setCreatingAdmin(false);
    }
  };

  // Delete an Administrator
  const handleDeleteAdmin = async (adminId: string, adminEmail: string) => {
    if (adminId === user?.uid) {
      alert("No puedes eliminar tu propia cuenta de acceso actual.");
      return;
    }
    if (adminEmail === "carbonelldaniel04@gmail.com") {
      alert("No está permitido eliminar de la base al Administrador Principal.");
      return;
    }
    if (!window.confirm(`¿Está seguro de que desea remover el acceso administrativo para ${adminEmail}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'admins', adminId));
      alert("Acceso administrador revocado de la base de datos.");
      fetchAdminList();
    } catch (err: any) {
      console.error("Failed to delete admin:", err);
      alert("Error al eliminar administrador: " + err.message);
    }
  };

  // Export CSV
  const handleExportBudgetsCSV = () => {
    const headers = "ID,Nombre,Telefono,Email,Localidad,Mensaje,Estado,CreadoEn,NotasAdmin\n";
    const entries = budgets.map(b => {
      const safeNotes = b.notes ? b.notes.replace(/"/g, '""') : '';
      return `"${b.id || ''}","${b.nombre}","${b.telefono}","${b.email}","${b.localidad}","${b.mensaje.substring(0, 100)}","${b.status}","${b.createdAt}","${safeNotes}"`;
    }).join("\n");

    const blob = new Blob([headers + entries], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `presupuestos_tao_chi_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };



  return (
    <div className="min-h-screen bg-[#07090E] text-[#F9FAFB] font-sans selection:bg-[#8B5A2B] selection:text-white relative overflow-x-hidden">
      
      {/* Decorative Steel Background Grids & Light Effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[10%] left-[-15%] w-[60%] h-[500px] rounded-full bg-gradient-to-br from-slate-800/10 via-zinc-800/5 to-transparent blur-3xl"></div>
        <div className="absolute bottom-[20%] right-[-10%] w-[50%] h-[600px] rounded-full bg-gradient-to-br from-[#8B5A2B]/5 to-transparent blur-3xl"></div>
        <div className="absolute inset-0 opacity-[0.02] bg-[linear-gradient(rgba(255,255,255,0.05)_1px,_transparent_1px),_linear-gradient(90deg,_rgba(255,255,255,0.05)_1px,_transparent_1px)] bg-[size:40px_40px]"></div>
      </div>

      {/* HEADER NAVBAR */}
      <header id="main-header" className="sticky top-0 z-40 bg-[#07090E]/80 backdrop-blur-md border-b border-slate-800/60 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          <div className="flex items-center space-x-3.5">
            <div className="relative group">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-slate-600 via-[#8B5A2B] to-zinc-600 opacity-40 blur group-hover:opacity-75 transition duration-300"></div>
              <div className="relative h-14 w-14 rounded-full overflow-hidden border border-[#B58A63]/60 shadow-lg">
                <img 
                  src="/src/assets/images/tao_chi_logo_1781218764206.jpg" 
                  alt="TAO-CHI Logo" 
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                />
              </div>
            </div>
            <div>
              <span className="font-extrabold text-[#F1F5F9] text-base sm:text-lg tracking-widest uppercase font-sans block">
                TAO-CHI
              </span>
              <span className="text-[9px] tracking-widest text-[#B58A63] font-mono uppercase block -mt-1 font-bold">
                Servicio Integral • S.F
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-8">
            <a href="#about" onClick={() => setIsAdminView(false)} className="text-sm font-medium text-slate-300 hover:text-[#B58A63] transition duration-200">Quiénes Somos</a>
            <a href="#services" onClick={() => setIsAdminView(false)} className="text-sm font-medium text-slate-300 hover:text-[#B58A63] transition duration-200">Servicios</a>
            <a href="#advantages" onClick={() => setIsAdminView(false)} className="text-sm font-medium text-slate-300 hover:text-[#B58A63] transition duration-200">Ventajas</a>
            <a href="#works" onClick={() => setIsAdminView(false)} className="text-sm font-medium text-slate-300 hover:text-[#B58A63] transition duration-200">Obras</a>
            <a href="#testimonials" onClick={() => setIsAdminView(false)} className="text-sm font-medium text-slate-300 hover:text-[#B58A63] transition duration-200">Clientes</a>
            <a href="#contact" onClick={() => setIsAdminView(false)} className="text-sm font-medium text-slate-300 hover:text-[#B58A63] transition duration-200">Contacto</a>
          </nav>

          {/* Panel Administrativo Trigger & Auth Action items */}
          <div className="hidden lg:flex items-center space-x-4">
            <button 
              id="btn-admin-view-toggle"
              onClick={() => setIsAdminView(!isAdminView)}
              className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wider uppercase flex items-center gap-2 border transition ${
                isAdminView 
                ? "bg-[#8B5A2B] text-white border-[#B58A63]" 
                : "bg-slate-800/80 text-slate-200 border-zinc-700 hover:bg-slate-700/80 hover:border-slate-500"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              {isAdminView ? "Ir al Sitio Web" : "Panel Administrativo"}
            </button>

            {user ? (
              <div className="flex items-center gap-2.5 bg-slate-900/90 py-1.5 px-3 rounded-lg border border-slate-800">
                <div className="text-right">
                  <span className="text-[10px] text-[#B58A63] block font-semibold leading-3">Admin {isRealAdmin ? 'Real' : 'Demo'}</span>
                  <span className="text-[11px] text-slate-300 block truncate max-w-[120px] font-mono">{user.email}</span>
                </div>
                <button 
                  id="btn-logout"
                  onClick={logout} 
                  title="Cerrar sesión"
                  className="p-1 px-2 text-slate-400 hover:text-red-400 transition"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button 
                id="btn-login-trigger"
                onClick={loginWithGoogle}
                className="bg-gradient-to-r from-[#8B5A2B] to-[#5C3A21] hover:brightness-110 text-slate-100 rounded-lg py-2 px-3.5 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition"
              >
                <LogIn className="h-3.5 w-3.5" />
                Ingreso Admin
              </button>
            )}
          </div>

          {/* Mobile responsive toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <button 
              id="btn-admin-mobile-toggle"
              onClick={() => {
                setIsAdminView(!isAdminView);
                setMobileMenuOpen(false);
              }}
              className="p-2 bg-slate-800/80 text-[#D69E2E] border border-slate-700 text-xs rounded-lg"
              title="Admin Panel"
            >
              <Sliders className="h-4 w-4" />
            </button>
            <button 
              id="btn-mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
              className="p-2 text-slate-300 hover:text-white"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

        </div>
      </header>

      {/* MOBILE NAV DRAWER */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0C0F16] border-b border-slate-800 z-30 relative px-4 py-6 space-y-3">
          <a href="#about" onClick={() => { setIsAdminView(false); setMobileMenuOpen(false); }} className="block py-2 text-base font-medium text-slate-300 hover:text-[#B58A63]">Quiénes Somos</a>
          <a href="#services" onClick={() => { setIsAdminView(false); setMobileMenuOpen(false); }} className="block py-2 text-base font-medium text-slate-300 hover:text-[#B58A63]">Servicios</a>
          <a href="#advantages" onClick={() => { setIsAdminView(false); setMobileMenuOpen(false); }} className="block py-2 text-base font-medium text-slate-300 hover:text-[#B58A63]">Ventajas del Steel Frame</a>
          <a href="#works" onClick={() => { setIsAdminView(false); setMobileMenuOpen(false); }} className="block py-2 text-base font-medium text-slate-300 hover:text-[#B58A63]">Obras Realizadas</a>
          <a href="#testimonials" onClick={() => { setIsAdminView(false); setMobileMenuOpen(false); }} className="block py-2 text-base font-medium text-slate-300 hover:text-[#B58A63]">Clientes Satisfechos</a>
          <a href="#contact" onClick={() => { setIsAdminView(false); setMobileMenuOpen(false); }} className="block py-2 text-base font-medium text-slate-300 hover:text-[#B58A63]">Solicitar Presupuesto</a>
          
          <div className="pt-4 border-t border-slate-800 flex flex-col gap-3">
            {user ? (
              <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <div className="truncate pr-2">
                  <span className="text-[10px] text-[#B58A63] block font-bold uppercase">{isRealAdmin ? "Admin Oficial" : "Admin Simulador"}</span>
                  <span className="text-xs text-slate-300 font-mono block truncate">{user.email}</span>
                </div>
                <button onClick={logout} className="p-2 text-red-400 bg-red-950/20 rounded">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => { loginWithGoogle(); setMobileMenuOpen(false); }}
                className="w-full bg-[#8B5A2B] py-2.5 text-center text-sm font-semibold text-white rounded-lg flex items-center justify-center gap-2"
              >
                <LogIn className="h-4 w-4" /> Authenticar Google
              </button>
            )}
          </div>
        </div>
      )}

      {/* ADMIN LEVEL NOTIFICATIONS & CLOUD SETUP PROMPT */}
      {isAdminView && (
        <div id="admin-banner-info" className="bg-gradient-to-r from-slate-900 via-[#5C3A21]/30 to-slate-900 border-b border-slate-800 px-4 py-3 text-xs">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-300">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#D69E2E] shrink-0" />
              <span>
                {isRealAdmin ? (
                  <strong className="text-slate-100 font-semibold text-amber-400">
                    ¡Conexión Activa de Administrador Real! Estás guardando directamente en Firestore en la nube.
                  </strong>
                ) : (
                  <>
                    <strong>Modo Simulación Administrativa Activo:</strong> Los cambios que hagas se guardan en el navegador de forma temporal. Registrate con <strong>carbonelldaniel04@gmail.com</strong> para persistir en Firestore en la nube o sembrá la base de datos de test si ya iniciaste sesión.
                  </>
                )}
              </span>
            </div>
            
            <div className="flex items-center gap-2 self-start sm:self-center">
              {isRealAdmin && (
                <button 
                  onClick={handleSeedDatabase}
                  className="bg-slate-800 hover:bg-slate-700 text-[#D69E2E] font-medium py-1 px-3.5 rounded border border-zinc-700 transition flex items-center gap-1.5"
                >
                  <Database className="h-3 w-3" /> Sembrar Firestore Real
                </button>
              )}
              <button 
                onClick={() => setIsDemoMode(!isDemoMode)}
                className={`py-1 px-3 rounded font-medium border text-[10px] transition uppercase tracking-wider ${
                  isDemoMode 
                  ? "bg-slate-800 text-slate-300 border-slate-750" 
                  : "bg-[#8B5A2B]/40 text-rose-100 border-[#8B5A2B]"
                }`}
              >
                {isDemoMode ? "Ver Guardado Demo Activo" : "Demo Desactivado"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN VIEW CONTENT AREA */}
      <main id="main-content" className="relative z-10">
        
        {isAdminView ? (
          !isRealAdmin ? (
            /* PUERTA DE ACCESO / LOGIN GATE */
            <section id="admin-login-gate" className="max-w-md mx-auto px-4 py-20">
              <div className="bg-[#111622] rounded-2xl p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#8B5A2B] via-[#D69E2E] to-[#5C3A21]" />
                
                <div className="text-center mb-8">
                  <div className="h-16 w-16 rounded-full overflow-hidden border border-[#B58A63]/40 mx-auto mb-4 bg-black/20 flex items-center justify-center">
                    <Key className="h-8 w-8 text-[#D69E2E]" />
                  </div>
                  <h2 className="text-xl font-extrabold uppercase text-slate-100 tracking-tight">Acceso Interno</h2>
                  <p className="text-xs text-slate-400 mt-1">Canal exclusivo para personal técnico y directivo de TAO-CHI</p>
                </div>

                <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">Correo Electrónico</label>
                    <input 
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="nombre@taochi.com"
                      className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2.5 px-3.5 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">Contraseña</label>
                    <input 
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2.5 px-3.5 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                    />
                  </div>

                  {loginError && (
                    <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-3 flex gap-2 text-xs text-red-300 font-sans">
                      <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full bg-gradient-to-r from-[#8B5A2B] to-[#5C3A21] hover:brightness-110 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg text-xs uppercase tracking-wider transition border border-[#B58A63] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loginLoading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Verificando...
                      </>
                    ) : (
                      "Iniciar Sesión"
                    )}
                  </button>
                </form>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
                  <div className="relative flex justify-center text-[10px] uppercase font-sans"><span className="bg-[#111622] px-2 text-slate-500">O ingresar con</span></div>
                </div>

                <button 
                  onClick={loginWithGoogle}
                  className="w-full bg-slate-900 hover:bg-slate-850 text-slate-200 py-2.5 px-4 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 border border-slate-800 transition cursor-pointer"
                >
                  <LogIn className="h-4 w-4 text-[#D69E2E]" /> Administrador Google
                </button>

                <div className="mt-6 text-center">
                  <button 
                    onClick={() => setIsAdminView(false)} 
                    className="text-xs text-slate-200 hover:text-white transition underline cursor-pointer"
                  >
                    Volver al sitio web
                  </button>
                </div>
              </div>
            </section>
          ) : (
            
            /* PANEL ADMINISTRATIVO PRINCIPAL */
            <section id="admin-workspace" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-800 pb-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full overflow-hidden border border-[#B58A63]/50 shrink-0 shadow-lg bg-black/20">
                  <img 
                    src="/src/assets/images/tao_chi_logo_1781218764206.jpg" 
                    alt="TAO-CHI Admin Logo" 
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-sans uppercase">
                    Panel de Gestión <span className="text-[#D08F4C]">TAO-CHI</span>
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    Control total de obras publicadas, testimonios de clientes, solicitudes de presupuestos e información general del sitio.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button 
                  onClick={() => setIsAdminView(false)}
                  className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs px-4 py-2.5 rounded-lg border border-zinc-700 transition"
                >
                  Regresar al Sitio
                </button>
                <button 
                  onClick={handleExportBudgetsCSV}
                  className="bg-[#8B5A2B] hover:brightness-110 text-white text-xs px-4 py-2.5 rounded-lg font-bold flex items-center gap-1.5 transition uppercase tracking-wider border border-[#B58A63]"
                >
                  <Download className="h-4 w-4" /> Exportar Presupuestos (CSV)
                </button>
              </div>
            </div>

            {/* Admin navigation tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4 mb-8">
              <button 
                onClick={() => setActiveAdminTab("works")}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                  activeAdminTab === "works" 
                  ? "bg-slate-800 text-[#D69E2E] border-b-2 border-[#D69E2E]" 
                  : "text-slate-400 hover:text-white"
                }`}
              >
                Galería de Obras ({displayWorks.length})
              </button>
              <button 
                onClick={() => setActiveAdminTab("testimonials")}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                  activeAdminTab === "testimonials" 
                  ? "bg-slate-800 text-[#D69E2E] border-b-2 border-[#D69E2E]" 
                  : "text-slate-400 hover:text-white"
                }`}
              >
                Clientes Felices ({displayTestimonials.length})
              </button>
              <button 
                onClick={() => setActiveAdminTab("content")}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                  activeAdminTab === "content" 
                  ? "bg-slate-800 text-[#D69E2E] border-b-2 border-[#D69E2E]" 
                  : "text-slate-400 hover:text-white"
                }`}
              >
                Contenido Web (Editables)
              </button>
              <button 
                onClick={() => setActiveAdminTab("budgets")}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition relative ${
                  activeAdminTab === "budgets" 
                  ? "bg-slate-800 text-[#D69E2E] border-b-2 border-[#D69E2E]" 
                  : "text-slate-400 hover:text-white"
                }`}
              >
                Solicitudes de Presupuesto ({budgets.length})
                {budgets.filter(b => b.status === "Pendiente").length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white font-mono font-bold text-[9px] h-4 w-4 rounded-full flex items-center justify-center animate-pulse">
                    {budgets.filter(b => b.status === "Pendiente").length}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setActiveAdminTab("personnel")}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                  activeAdminTab === "personnel" 
                  ? "bg-slate-800 text-[#D69E2E] border-b-2 border-[#D69E2E]" 
                  : "text-slate-400 hover:text-white"
                }`}
              >
                Personal / Admins
              </button>
            </div>

            {/* TAB CONTENT: WORKS MANAGER */}
            {activeAdminTab === "works" && (
              <div id="tab-works-manager" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Form column */}
                <div id="work-form-container" className="bg-[#111622] rounded-xl p-6 border border-slate-800/80">
                  <h3 className="text-lg font-bold text-slate-100 mb-4 border-b border-slate-800 pb-2 flex items-center justify-between">
                    <span>{editingWork ? "Editar Obra" : "Agregar Nueva Obra"}</span>
                    {editingWork && (
                      <button 
                        onClick={() => {
                          setEditingWork(null);
                          setNewWork({ title: '', description: '', category: 'Viviendas', imageUrl: '', location: '', date: '', featured: false });
                        }}
                        className="text-xs text-red-400 font-normal hover:underline"
                      >
                        Cancelar Edición
                      </button>
                    )}
                  </h3>

                  <form onSubmit={handleSaveWork} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Título de la Obra *</label>
                      <input 
                        type="text"
                        value={newWork.title || ''}
                        onChange={(e) => setNewWork({...newWork, title: e.target.value})}
                        className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                        placeholder="Ej: Residencia Altos de Luján"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Categoría *</label>
                        <select 
                          value={newWork.category || 'Viviendas'}
                          onChange={(e) => setNewWork({...newWork, category: e.target.value as any})}
                          className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                        >
                          <option value="Viviendas">Viviendas</option>
                          <option value="Comerciales">Comerciales</option>
                          <option value="Ampliaciones">Ampliaciones</option>
                          <option value="Remodelaciones">Remodelaciones</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Destacado</label>
                        <button 
                          type="button"
                          onClick={() => setNewWork({...newWork, featured: !newWork.featured})}
                          className={`w-full py-2 rounded-lg text-xs font-bold border tracking-wider transition ${
                            newWork.featured 
                            ? "bg-[#8B5A2B]/40 text-amber-200 border-[#8B5A2B]" 
                            : "bg-[#07090E] text-slate-400 border-slate-800 hover:text-white"
                          }`}
                        >
                          {newWork.featured ? "SÍ, DESTACADO" : "NO DESTACADO"}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">URL de Imagen (Unsplash u otras)*</label>
                      <input 
                        type="url"
                        value={newWork.imageUrl || ''}
                        onChange={(e) => setNewWork({...newWork, imageUrl: e.target.value})}
                        className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                        placeholder="https://images.unsplash.com/..."
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Localidad</label>
                        <input 
                          type="text"
                          value={newWork.location || ''}
                          onChange={(e) => setNewWork({...newWork, location: e.target.value})}
                          className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                          placeholder="Funes, Santa Fe"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Fecha</label>
                        <input 
                          type="text"
                          value={newWork.date || ''}
                          onChange={(e) => setNewWork({...newWork, date: e.target.value})}
                          className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                          placeholder="Abril 2026"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">URL de Video Opcional (YouTube / Mp4)</label>
                      <input 
                        type="text"
                        value={newWork.videoUrl || ''}
                        onChange={(e) => setNewWork({...newWork, videoUrl: e.target.value})}
                        className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                        placeholder="https://..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Descripción de la Obra (Técnica / Detalle)</label>
                      <textarea 
                        value={newWork.description || ''}
                        onChange={(e) => setNewWork({...newWork, description: e.target.value})}
                        rows={4}
                        className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none resize-none"
                        placeholder="Detallar tipos de perfiles, placas cementicias o terminaciones hechas en Steel Framing..."
                      />
                    </div>

                    <button 
                      type="submit"
                      className="w-full bg-gradient-to-r from-[#8B5A2B] to-[#5C3A21] hover:brightness-115 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider transition border border-[#B58A63]"
                    >
                      {editingWork ? "Guardar Modificaciones" : "Publicar Obra en Galería"}
                    </button>
                  </form>
                </div>

                {/* List column */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-[#111622] rounded-xl p-5 border border-slate-800/80 flex justify-between items-center">
                    <div>
                      <h3 className="text-base font-bold text-slate-100">Obras Publicadas</h3>
                      <p className="text-xs text-slate-400">Total: {displayWorks.length} registros en pantalla.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {displayWorks.map((work) => (
                      <div key={work.id} className="bg-[#111622] rounded-xl overflow-hidden border border-slate-800/80 hover:border-slate-700/60 transition flex flex-col justify-between">
                        <div>
                          <div className="h-44 w-full relative bg-slate-800">
                            <img src={work.imageUrl} alt={work.title} className="h-full w-full object-cover" />
                            <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
                              <span className="bg-[#1C2434]/90 text-slate-200 border border-slate-700 text-[10px] uppercase font-bold py-0.5 px-2.5 rounded-full">
                                {work.category}
                              </span>
                              {work.featured && (
                                <span className="bg-[#8B5A2B]/90 text-[#F9FAFB] border border-[#B58A63] text-[10px] uppercase font-bold py-0.5 px-2.5 rounded-full">
                                  ★ Destacado
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="p-4">
                            <h4 className="font-bold text-slate-100 text-sm line-clamp-1">{work.title}</h4>
                            <p className="text-slate-400 text-xs mt-1.5 font-mono flex items-center gap-1">
                              <span>📍 {work.location || 'S/D'}</span>
                              <span className="text-slate-500">•</span>
                              <span>📅 {work.date || 'S/D'}</span>
                            </p>
                            <p className="text-slate-400 text-xs mt-2 line-clamp-3 leading-relaxed">{work.description}</p>
                          </div>
                        </div>

                        <div className="p-4 pt-0 border-t border-slate-800/60 mt-3 flex justify-end gap-2.5">
                          <button 
                            onClick={() => {
                              setEditingWork(work);
                              setNewWork({ 
                                title: work.title, 
                                description: work.description, 
                                category: work.category, 
                                imageUrl: work.imageUrl, 
                                location: work.location || '', 
                                date: work.date || '', 
                                featured: !!work.featured,
                                videoUrl: work.videoUrl || ''
                              });
                              setTimeout(() => {
                                document.getElementById('work-form-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 50);
                            }}
                            className="bg-slate-800/80 hover:bg-slate-700 text-white text-xs py-1.5 px-3 rounded-lg border border-zinc-700 flex items-center gap-1 transition"
                          >
                            <Edit2 className="h-3.5 w-3.5 text-[#B58A63]" /> Editar
                          </button>
                          <button 
                            onClick={() => handleDeleteWork(work.id!)}
                            className="bg-red-950/20 hover:bg-red-900/30 text-rose-300 text-xs py-1.5 px-3 rounded-lg border border-red-900/60 flex items-center gap-1 transition"
                          >
                            <Trash className="h-3.5 w-3.5" /> Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              </div>
            )}

            {/* TAB CONTENT: TESTIMONIALS MANAGER */}
            {activeAdminTab === "testimonials" && (
              <div id="tab-testimonials-manager" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Form column */}
                <div id="testimonial-form-container" className="bg-[#111622] rounded-xl p-6 border border-slate-800/80">
                  <h3 className="text-lg font-bold text-slate-100 mb-4 border-b border-slate-800 pb-2">
                    {editingTestimonial ? "Modificar Testimonio" : "Agregar Nuevo Testimonio"}
                  </h3>

                  <form onSubmit={handleSaveTestimonial} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Nombre del Cliente *</label>
                      <input 
                        type="text"
                        value={newTestimonial.name || ''}
                        onChange={(e) => setNewTestimonial({...newTestimonial, name: e.target.value})}
                        className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                        placeholder="Ej: Inga. Julia Altieri"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">ProyectoAsociado</label>
                        <input 
                          type="text"
                          value={newTestimonial.projectTitle || ''}
                          onChange={(e) => setNewTestimonial({...newTestimonial, projectTitle: e.target.value})}
                          className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                          placeholder="Ej: Duplex Rosario"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Calificación (1-5)</label>
                        <select 
                          value={newTestimonial.rating || 5}
                          onChange={(e) => setNewTestimonial({...newTestimonial, rating: Number(e.target.value)})}
                          className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                        >
                          <option value="5">★★★★★ (5 Estrellas)</option>
                          <option value="4">★★★★ (4 Estrellas)</option>
                          <option value="3">★★★ (3 Estrellas)</option>
                          <option value="2">★★ (2 Estrellas)</option>
                          <option value="1">★ (1 Estrella)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">URL de Foto de Perfil (Opcional)</label>
                      <input 
                        type="url"
                        value={newTestimonial.photoUrl || ''}
                        onChange={(e) => setNewTestimonial({...newTestimonial, photoUrl: e.target.value})}
                        className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                        placeholder="https://images.unsplash.com/..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Reseña o Comentario *</label>
                      <textarea 
                        value={newTestimonial.review || ''}
                        onChange={(e) => setNewTestimonial({...newTestimonial, review: e.target.value})}
                        rows={4}
                        className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none resize-none"
                        placeholder="Escribe la experiencia descrita por el propietario sobre el aislamiento térmico u velocidad..."
                        required
                      />
                    </div>

                    <button 
                      type="submit"
                      className="w-full bg-gradient-to-r from-[#8B5A2B] to-[#5C3A21] hover:brightness-115 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider transition border border-[#B58A63]"
                    >
                      {editingTestimonial ? "Actualizar Testimonio" : "Grabar Testimonio"}
                    </button>
                  </form>
                </div>

                {/* List column */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-[#111622] rounded-xl p-5 border border-slate-800/80">
                    <h3 className="text-base font-bold text-slate-100 text-sm mb-1">Testimonios de Clientes</h3>
                    <p className="text-xs text-slate-400">Son expuestos de manera rotativa en la página web institucional.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {displayTestimonials.map((t) => (
                      <div key={t.id} className="bg-[#111622] rounded-xl p-5 border border-slate-800/80 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                        <div className="flex items-start gap-3.5">
                          <img 
                            src={t.photoUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150"} 
                            alt={t.name} 
                            className="h-12 w-12 rounded-full object-cover border border-slate-700 shrink-0" 
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-100 text-sm">{t.name}</h4>
                              <span className="text-xs text-[#B58A63] font-mono">({t.projectTitle || 'General'})</span>
                            </div>
                            <div className="flex items-center text-amber-400 text-xs mt-0.5">
                              {Array.from({ length: t.rating }).map((_, i) => (
                                <Star key={i} className="h-3 w-3 fill-current inline" />
                              ))}
                            </div>
                            <p className="text-slate-400 text-xs mt-2 italic leading-relaxed">"{t.review}"</p>
                          </div>
                        </div>

                        <div className="flex gap-2 shrink-0 self-end md:self-center border-t md:border-t-0 pt-3 md:pt-0 w-full md:w-auto justify-end">
                          <button 
                            onClick={() => {
                              setEditingTestimonial(t);
                              setNewTestimonial({ 
                                name: t.name, 
                                review: t.review, 
                                rating: t.rating, 
                                projectTitle: t.projectTitle || '', 
                                photoUrl: t.photoUrl || '', 
                                videoUrl: t.videoUrl || ''
                              });
                              setTimeout(() => {
                                document.getElementById('testimonial-form-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 50);
                            }}
                            className="bg-slate-800/80 hover:bg-slate-700 text-white text-xs py-1 px-3 rounded border border-zinc-700 flex items-center gap-1 transition"
                          >
                            <Edit2 className="h-3.5 w-3.5 text-[#B58A63]" /> Editar
                          </button>
                          <button 
                            onClick={() => handleDeleteTestimonial(t.id!)}
                            className="bg-red-950/20 hover:bg-red-900/40 text-rose-300 text-xs py-1 px-3 rounded border border-red-900/60 transition"
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              </div>
            )}

            {/* TAB CONTENT: WEB CONTENT GENERAL EDITORS */}
            {activeAdminTab === "content" && (
              <div id="tab-web-content-editor" className="bg-[#111622] rounded-xl p-6 border border-slate-800/80 max-w-3xl mx-auto">
                <h3 className="text-lg font-bold text-slate-100 mb-6 border-b border-slate-800 pb-3 block">
                  Configuración del Copiado Web (Textos e Integraciones)
                </h3>

                <form onSubmit={handleSaveWebContent} className="space-y-6">
                  
                  <div className="bg-[#07090E]/80 p-4 rounded-lg border border-slate-800">
                    <h4 className="text-xs font-extrabold text-[#D69E2E] tracking-widest uppercase mb-3 font-mono">Presentación (Section Hero)</h4>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Título de Impacto (Headline) *</label>
                        <input 
                          type="text"
                          value={editContent.heroHeadline}
                          onChange={(e) => setEditContent({...editContent, heroHeadline: e.target.value})}
                          className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Subtítulo Descriptivo (Sub-headline)</label>
                        <textarea 
                          value={editContent.heroSubheadline}
                          onChange={(e) => setEditContent({...editContent, heroSubheadline: e.target.value})}
                          rows={3}
                          className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">URL de Imagen de Fondo Principal (Unsplash)</label>
                        <input 
                          type="url"
                          value={editContent.heroImageUrl || ''}
                          onChange={(e) => setEditContent({...editContent, heroImageUrl: e.target.value})}
                          className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#07090E]/80 p-4 rounded-lg border border-slate-800">
                    <h4 className="text-xs font-extrabold text-[#D69E2E] tracking-widest uppercase mb-3 font-mono">Nosotros (About Text)</h4>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Descripción del Compromiso Corporativo</label>
                      <textarea 
                        value={editContent.aboutText || ''}
                        onChange={(e) => setEditContent({...editContent, aboutText: e.target.value})}
                        rows={5}
                        className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-1 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                      />
                    </div>
                  </div>

                  <div className="bg-[#07090E]/80 p-4 rounded-lg border border-slate-800">
                    <h4 className="text-xs font-extrabold text-[#D69E2E] tracking-widest uppercase mb-3 font-mono">Métricas de Rendimiento (Estadísticas)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Obras Realizadas</label>
                        <input 
                          type="text"
                          value={editContent.statsCompletedWorks || ''}
                          onChange={(e) => setEditContent({...editContent, statsCompletedWorks: e.target.value})}
                          className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                          placeholder="Ej: 100+"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Años de Trayectoria</label>
                        <input 
                          type="text"
                          value={editContent.statsYearsExperience || ''}
                          onChange={(e) => setEditContent({...editContent, statsYearsExperience: e.target.value})}
                          className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                          placeholder="Ej: 15+"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Clientes Satisfechos</label>
                        <input 
                          type="text"
                          value={editContent.statsSatisfiedClients || ''}
                          onChange={(e) => setEditContent({...editContent, statsSatisfiedClients: e.target.value})}
                          className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                          placeholder="Ej: 100%"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#07090E]/80 p-4 rounded-lg border border-slate-800">
                    <h4 className="text-xs font-extrabold text-[#D69E2E] tracking-widest uppercase mb-3 font-mono">Canales de Integración Directa</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">WhatsApp deContacto (Con código país)*</label>
                        <input 
                          type="text"
                          value={editContent.whatsappNumber || ''}
                          onChange={(e) => setEditContent({...editContent, whatsappNumber: e.target.value})}
                          className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                          placeholder="Fórmula: 54911223344"
                        />
                      </div>

                      <div>
                        <label className="block text-[#9CA3AF] text-xs font-semibold uppercase mb-1">Mensaje Predeterminado de WhatsApp</label>
                        <input 
                          type="text"
                          value={editContent.whatsappMessage || ''}
                          onChange={(e) => setEditContent({...editContent, whatsappMessage: e.target.value})}
                          className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#07090E]/80 p-4 rounded-lg border border-slate-800 space-y-4">
                    <h4 className="text-xs font-extrabold text-[#D69E2E] tracking-widest uppercase font-mono border-b border-slate-850 pb-2">Servicio de Mensajería de IA (Enlace n8n / Gemini)</h4>
                    
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">URL de Webhook n8n (Opcional - Envía POST en vivo)</label>
                      <input 
                        type="url"
                        value={editContent.n8nWebhookUrl || ''}
                        onChange={(e) => setEditContent({...editContent, n8nWebhookUrl: e.target.value})}
                        className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-xs font-mono focus:border-[#8B5A2B] outline-none text-[#B58A63]"
                        placeholder="Ej: https://n8n.tu-servidor.com/webhook/chat-stelframe"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Si está en blanco, el chatbot recurrirá de manera segura e inteligente a la IA local Gemini 3.5.
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Instrucciones de Personalidad y Contexto de la IA (System Instructions)</label>
                      <textarea 
                        value={editContent.aiSystemInstruction || ''}
                        onChange={(e) => setEditContent({...editContent, aiSystemInstruction: e.target.value})}
                        rows={4}
                        className="w-full bg-[#111622] border border-slate-800 rounded-lg py-2 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none resize-none"
                        placeholder="Ej: Sos el asistente de TAO-CHI. Habla siempre con amabilidad..."
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#8B5A2B] to-[#5C3A21] hover:brightness-110 text-white font-bold py-3 px-4 rounded-lg text-xs uppercase tracking-wider transition border border-[#B58A63]"
                  >
                    Guardar Cambios Web Generales
                  </button>
                </form>
              </div>
            )}

            {/* TAB CONTENT: BUDGETS COMPREHENSIVE CONTROL */}
            {activeAdminTab === "budgets" && (
              <div id="tab-budgets-desk" className="space-y-6">
                
                <div className="bg-[#111622] rounded-xl p-5 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-100">Bandeja de Consultas Realizadas</h3>
                    <p className="text-xs text-slate-400">Canal directo de leads originados en el formulario web.</p>
                  </div>
                  <div>
                    <span className="bg-[#1C2434] text-slate-300 border border-slate-800 py-1.5 px-3 rounded-lg text-xs font-mono font-bold">
                      Pendientes: {budgets.filter(b => b.status === "Pendiente").length} / Totales: {budgets.length}
                    </span>
                  </div>
                </div>

                {budgets.length === 0 ? (
                  <div className="bg-[#111622] rounded-xl p-12 text-center border border-slate-800/80">
                    <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">No se han registrado solicitudes de presupuesto aún.</p>
                    <p className="text-xs text-slate-600 mt-1">Completa el formulario en la Home para ver ingresos simulados en vivo.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {budgets.map((b) => (
                      <div key={b.id} className="bg-[#111622] rounded-xl p-6 border border-slate-800/80 hover:border-slate-750 transition flex flex-col justify-between">
                        
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
                          <div>
                            <div className="flex items-center gap-3">
                              <h4 className="font-bold text-slate-100 text-base">{b.nombre}</h4>
                              <span className={`text-[10px] font-mono uppercase font-bold py-0.5 px-2.5 rounded-full border ${
                                b.status === 'Pendiente' ? 'bg-slate-900 text-slate-300 border-slate-700' :
                                b.status === 'En Contacto' ? 'bg-amber-950/30 text-amber-300 border-amber-900/50' :
                                b.status === 'Presupuestado' ? 'bg-[#ffeedd]/5 text-[#8B5A2B] border-[#8B5A2B]/40' :
                                'bg-red-950/20 text-rose-300 border-red-900/40'
                              }`}>
                                {b.status}
                              </span>
                            </div>
                            <p className="text-slate-400 text-xs mt-1 font-mono">
                              📍 Localidad: <span className="text-slate-350">{b.localidad}</span> | 📅 Recibido: {new Date(b.createdAt).toLocaleString('es-AR')}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-400">Cambiar Tratamiento:</span>
                            <select 
                              value={b.status}
                              onChange={(e) => handleUpdateBudgetStatus(b.id!, e.target.value as any)}
                              className="bg-[#07090E] border border-slate-800 text-slate-200 text-xs rounded py-1 px-2 outline-none focus:border-[#8B5A2B]"
                            >
                              <option value="Pendiente">Pendiente</option>
                              <option value="En Contacto">En Contacto</option>
                              <option value="Presupuestado">Presupuestado</option>
                              <option value="Rechazado">Rechazado</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block mb-1">Información de Contacto</span>
                            <div className="space-y-1.5 font-mono text-xs">
                              <p className="text-slate-300">📞 Teléfono: {b.telefono}</p>
                              <p className="text-slate-300">✉ Email: {b.email}</p>
                              <div className="pt-2">
                                <a 
                                  href={`https://wa.me/${b.telefono.replace(/[^0-9]/g, '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-[#D69E2E] hover:underline flex items-center gap-1.5 font-sans font-bold text-xs"
                                >
                                  <Phone className="h-3.5 w-3.5" /> Chatear por WhatsApp
                                </a>
                              </div>
                            </div>
                          </div>

                          <div>
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block mb-1">Mensaje / Proyecto Solicitado</span>
                            <p className="text-slate-300 text-xs leading-relaxed bg-[#07090E]/80 p-3 rounded-lg border border-slate-800/80 italic">
                              "{b.mensaje}"
                            </p>
                          </div>
                        </div>

                        {/* Internal notes track */}
                        <div className="bg-[#07090E]/60 p-4 rounded-lg border border-slate-850 mt-2">
                          <span className="text-[10px] font-extrabold text-[#B58A63] uppercase tracking-widest block mb-1">Notas de Seguimiento Interno</span>
                          {budgetStatusComment.id === b.id ? (
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                value={budgetStatusComment.notes}
                                onChange={(e) => setBudgetStatusComment({...budgetStatusComment, notes: e.target.value})}
                                className="flex-1 bg-[#111622] rounded border border-slate-850 px-2 py-1 text-xs text-white outline-none"
                                placeholder="Escribe notas como 'Ya se le cotizó el m2 a $...'"
                              />
                              <button 
                                onClick={() => handleSaveBudgetNotes(b.id!)}
                                className="bg-[#8B5A2B] text-white font-bold text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded"
                              >
                                Grabar
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center gap-4">
                              <p className="text-slate-405 text-xs italic">
                                {b.notes || "Ningún comentario de seguimiento todavía."}
                              </p>
                              <button 
                                onClick={() => setBudgetStatusComment({id: b.id!, notes: b.notes || ''})}
                                className="text-xs text-[#D69E2E] hover:underline shrink-0"
                              >
                                {b.notes ? "Modificar Nota" : "+ Agregar Nota"}
                              </button>
                            </div>
                          )}
                        </div>

                      </div>
                    ))}
                  </div>
                )}

              </div>
            )}

            {activeAdminTab === "personnel" && (
              <div id="tab-personnel-manager" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Form column */}
                <div className="bg-[#111622] rounded-xl p-6 border border-slate-800/80 h-fit">
                  <h3 className="text-lg font-bold text-slate-100 mb-4 border-b border-slate-800 pb-2 flex items-center gap-2 font-sans uppercase tracking-tight">
                    <Plus className="h-4 w-4 text-[#D69E2E]" />
                    <span>Registrar Nuevo Personal</span>
                  </h3>

                  <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[11px] text-amber-300 leading-relaxed font-sans">
                    <strong className="font-bold uppercase tracking-wide block mb-1">ℹ️ Requisito del Servidor</strong>
                    Para poder registrar personal con <strong>Email y Contraseña</strong>, recuerda activar el proveedor de inicio de sesión <strong>"Correo electrónico/contraseña"</strong> en tu consola de Firebase (Sección <em>Authentication &gt; Sign-in method</em>).
                  </div>
                  
                  <form onSubmit={handleCreateAdmin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">Nombre Completo</label>
                      <input 
                        type="text"
                        required
                        placeholder="Ej. Juan Pérez"
                        value={newAdminName}
                        onChange={(e) => setNewAdminName(e.target.value)}
                        className="w-full bg-[#07090E] border border-slate-850 rounded-lg py-2.5 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">Email de la Empresa</label>
                      <input 
                        type="email"
                        required
                        placeholder="Ej. juan@taochi.com"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        className="w-full bg-[#07090E] border border-slate-850 rounded-lg py-2.5 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">Contraseña (mínimo 6 caracteres)</label>
                      <input 
                        type="password"
                        required
                        placeholder="••••••••"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        className="w-full bg-[#07090E] border border-slate-850 rounded-lg py-2.5 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={creatingAdmin}
                      className="w-full bg-[#8B5A2B] hover:bg-[#8B5A2B]/85 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider transition border border-[#B58A63] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {creatingAdmin ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Registrando...
                        </>
                      ) : (
                        "Registrar Administrador"
                      )}
                    </button>
                  </form>
                  
                  <div className="mt-5 bg-slate-900/60 rounded-lg p-3.5 border border-slate-800 text-[11px] text-slate-400 leading-relaxed font-sans">
                    <strong className="text-amber-500 block mb-0.5 font-semibold">⚠️ Nota de Seguridad:</strong>
                    El personal registrado tendrá acceso administrativo absoluto. No compartas contraseñas débiles o por canales públicos.
                  </div>
                </div>

                {/* List column */}
                <div className="bg-[#111622] lg:col-span-2 rounded-xl p-6 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
                    <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 font-sans uppercase tracking-tight">
                      <Sliders className="h-4 w-4 text-[#D69E2E]" />
                      <span>Personal con Acceso Autorizado</span>
                    </h3>
                    <button 
                      onClick={fetchAdminList}
                      className="text-slate-400 hover:text-white p-1 transition cursor-pointer"
                      title="Refrescar lista"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {loadingAdmins ? (
                    <div className="py-12 text-center text-slate-500 text-sm font-sans">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-[#D69E2E]" />
                      Cargando listado de personal...
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs font-sans">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="py-2.5 font-bold uppercase tracking-wider">Nombre</th>
                            <th className="py-2.5 font-bold uppercase tracking-wider">Email</th>
                            <th className="py-2.5 font-bold uppercase tracking-wider">Registrado El</th>
                            <th className="py-2.5 font-bold uppercase tracking-wider">Por</th>
                            <th className="py-2.5 font-bold uppercase tracking-wider text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Always list the master admin first since they might not be explicitly inside admins doc collection */}
                          <tr className="border-b border-slate-850/60 hover:bg-slate-900/30">
                            <td className="py-3 font-semibold text-[#D69E2E]">Admin Principal</td>
                            <td className="py-3 font-mono text-slate-300">carbonelldaniel04@gmail.com</td>
                            <td className="py-3 text-slate-400">Sistema Inic.</td>
                            <td className="py-3 text-slate-400">Auto</td>
                            <td className="py-3 text-right">
                              <span className="text-[9px] bg-[#8B5A2B]/20 text-[#D69E2E] py-0.5 px-2 rounded-full border border-[#8B5A2B]/40 font-bold uppercase">
                                Master
                              </span>
                            </td>
                          </tr>
                          
                          {adminList.filter(a => a.email !== "carbonelldaniel04@gmail.com").length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                                No hay otros administradores de personal registrados en Firestore.
                              </td>
                            </tr>
                          ) : (
                            adminList
                              .filter(a => a.email !== "carbonelldaniel04@gmail.com")
                              .map((admin) => (
                                <tr key={admin.id} className="border-b border-slate-850/60 hover:bg-slate-900/30">
                                  <td className="py-3 font-semibold text-slate-200">{admin.name || "Sin Nombre"}</td>
                                  <td className="py-3 font-mono text-slate-300">{admin.email}</td>
                                  <td className="py-3 text-slate-400">
                                    {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString('es-AR') : "—"}
                                  </td>
                                  <td className="py-3 text-slate-400 truncate max-w-[100px]">{admin.addedBy || "—"}</td>
                                  <td className="py-3 text-right">
                                    <button
                                      onClick={() => handleDeleteAdmin(admin.id, admin.email)}
                                      className="p-1 px-2 hover:bg-red-950/20 rounded border border-transparent hover:border-red-900/20 text-red-400 hover:text-red-300 transition cursor-pointer"
                                      title="Revocar acceso"
                                    >
                                      <Trash className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            )}

          </section>
          )
        ) : (
          
          /* PUBLIC INSTITUTIONAL WEBSITE */
          <div id="institutional-portal">

            {/* HERO INTRODUCTION */}
            <section id="hero" className="relative min-h-[90vh] flex items-center justify-center pt-20 z-0">
              
              {/* Background cover image & heavy overlay */}
              <div className="absolute inset-0 z-0">
                <img 
                  src={displayWebContent.heroImageUrl || "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&q=80&w=1600"} 
                  alt="Steel Framing structure" 
                  className="h-full w-full object-cover filter brightness-[0.22] contrast-[1.05]" 
                />
                
                {/* Simulated steel overlay with horizontal hairline reflection */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#07090E] via-[#07090E]/65 to-[#07090E]/20"></div>
                
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-slate-500/30 to-transparent"></div>
              </div>

              <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
                <div className="inline-flex items-center gap-2 bg-slate-900/95 py-1.5 px-4 rounded-full border border-slate-800 shadow-xl mb-6">
                  <span className="h-2 w-2 rounded-full bg-[#B58A63] animate-pulse"></span>
                  <span className="text-[10px] tracking-widest font-mono uppercase font-black text-slate-300">
                    SISTEMA CERTIFICADO CON ACCESO INTEGRAL LLAVE EN MANO
                  </span>
                </div>

                <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black uppercase tracking-tight leading-[1.05] font-sans max-w-5xl mx-auto">
                  {displayWebContent.heroHeadline}
                </h1>

                <p className="text-base sm:text-xl text-slate-400 font-normal mt-6 max-w-3xl mx-auto leading-relaxed">
                  {displayWebContent.heroSubheadline}
                </p>

                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <a 
                    href="#contact"
                    className="w-full sm:w-auto bg-gradient-to-r from-[#8B5A2B] to-[#5C3A21] hover:brightness-110 text-white font-bold py-3.5 px-8 rounded-lg text-xs tracking-widest uppercase transition border border-[#B58A63] shadow-lg shadow-amber-955/20 text-center"
                  >
                    Solicitar Presupuesto
                  </a>
                  <a 
                    href="#works"
                    className="w-full sm:w-auto bg-slate-900/90 text-slate-100 hover:bg-slate-800 font-bold py-3.5 px-8 rounded-lg text-xs tracking-widest uppercase transition border border-zinc-700 hover:border-slate-500 text-center"
                  >
                    Ver Obras Ejecutadas
                  </a>
                </div>

                {/* Instant performance stats */}
                <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto pt-10 border-t border-slate-900/60">
                  <div className="bg-slate-950/60 backdrop-blur p-4 rounded-lg border border-slate-850 text-center">
                    <span className="block text-3xl font-black text-[#D69E2E] font-mono">{displayWebContent.statsCompletedWorks || "100+"}</span>
                    <span className="block text-[10px] tracking-widest text-[#B58A63] uppercase mt-1 font-bold">Obras Realizadas</span>
                  </div>
                  <div className="bg-slate-950/60 backdrop-blur p-4 rounded-lg border border-slate-850 text-center">
                    <span className="block text-3xl font-black text-slate-100 font-mono">{displayWebContent.statsYearsExperience || "15+"}</span>
                    <span className="block text-[10px] tracking-widest text-[#B58A63] uppercase mt-1 font-bold">Años de Trayectoria</span>
                  </div>
                  <div className="bg-slate-950/60 backdrop-blur p-4 rounded-lg border border-slate-850 text-center">
                    <span className="block text-3xl font-black text-[#D69E2E] font-mono">{displayWebContent.statsSatisfiedClients || "100%"}</span>
                    <span className="block text-[10px] tracking-widest text-[#B58A63] uppercase mt-1 font-bold">Clientes Satisfechos</span>
                  </div>
                </div>

              </div>
            </section>

            {/* QUIÉNES SOMOS */}
            <section id="about" className="py-24 bg-[#0A0D14] border-t border-slate-900 relative">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                  
                  {/* Copy side */}
                  <div className="space-y-6">
                    <div className="inline-block">
                      <span className="text-[#D69E2E] text-xs font-extrabold tracking-widest uppercase font-mono block mb-1">
                        EXCELENCIA ARQUITECTÓNICA
                      </span>
                      <h2 className="text-3xl sm:text-4xl font-extrabold uppercase text-slate-100 tracking-tight">
                        Quiénes Somos
                      </h2>
                      <div className="h-1 w-16 bg-[#8B5A2B] mt-2 rounded"></div>
                    </div>

                    <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">
                      {displayWebContent.aboutText}
                    </p>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-900/80">
                      <div>
                        <strong className="text-slate-100 text-sm block">✓ Obra Limpia y Seca</strong>
                        <span className="text-xs text-slate-400">Cero desperdicios inútiles en el lote.</span>
                      </div>
                      <div>
                        <strong className="text-slate-100 text-sm block">✓ Ingenieria Estructural</strong>
                        <span className="text-xs text-slate-400">Cálculos rigurosos de perfiles galvanizados.</span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Steel Framing Layers Diagram */}
                  <div className="bg-gradient-to-br from-[#121622] to-slate-950 rounded-xl p-6 sm:p-8 border border-slate-800/80 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-2 right-3 text-[10px] font-mono text-[#B58A63]">
                      CORTESÍA DE TAO-CHI
                    </div>

                    <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-widest mb-6 border-b border-slate-800 pb-2">
                      SISTEMA MULTICAPA STEEL FRAME
                    </h3>

                    {/* Interactive diagram preview of layering */}
                    <div className="space-y-3 font-mono text-[11px]">
                      
                      <div className="p-3 bg-slate-900/85 hover:border-[#8B5A2B] transition-all rounded border border-slate-800 flex justify-between items-center">
                        <span className="text-[#D69E2E] font-bold">Paso 1. Perfilería Galvanizada</span>
                        <span className="text-slate-400">P.G.U. y P.G.C. de 100/150mm</span>
                      </div>

                      <div className="p-3 bg-slate-900/85 hover:border-[#8B5A2B] transition-all rounded border border-slate-800 flex justify-between items-center">
                        <span className="text-slate-300 font-semibold">Paso 2. Placa Rigidizadora OSB</span>
                        <span className="text-slate-450 text-[10px]">Espesor 15mm estructural</span>
                      </div>

                      <div className="p-3 bg-[#111622] hover:border-[#8B5A2B] transition-all rounded border border-slate-800 flex justify-between items-center">
                        <span className="text-slate-300 font-semibold">Paso 3. Membrana W.H. (Tyvek)</span>
                        <span className="text-[#B58A63] text-xs font-bold">Barrera Hidrófuga e Hidrorrepelente</span>
                      </div>

                      <div className="p-3 bg-slate-900/85 hover:border-[#8B5A2B] transition-all rounded border border-slate-800 flex justify-between items-center">
                        <span className="text-slate-300 font-semibold">Paso 4. EPS (Poliestireno Expandido)</span>
                        <span className="text-slate-450">Aislamiento Térmico E.I.F.S.</span>
                      </div>

                      <div className="p-3 bg-slate-900/85 hover:border-[#8B5A2B] transition-all rounded border border-slate-800 flex justify-between items-center">
                        <span className="text-slate-350 font-semibold">Paso 5. Base Coat + Malla de Fibra</span>
                        <span className="text-slate-450">Impermeabilidad absoluta</span>
                      </div>

                      <div className="p-3 bg-[#1F1D1B] border-[#8B5A2B] rounded border flex justify-between items-center">
                        <span className="text-[#E6C39D] font-bold">Paso 6. Revoque Plástico Acrílico</span>
                        <span className="text-[#B58A63]">Terminación Texturada Premium</span>
                      </div>

                    </div>
                  </div>

                </div>

              </div>
            </section>

            {/* NUESTROS SERVICIOS */}
            <section id="services" className="py-24 bg-[#07090E] relative">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                
                <div className="text-center max-w-3xl mx-auto mb-16">
                  <span className="text-[#D69E2E] text-xs font-extrabold tracking-widest uppercase font-mono block">NUESTRA ESPECIALIZACIÓN</span>
                  <h2 className="text-3xl sm:text-5xl font-black uppercase text-slate-100 tracking-tight mt-1">Servicios Profesionales</h2>
                  <div className="h-1 w-16 bg-[#8B5A2B] mx-auto mt-3 rounded"></div>
                  <p className="text-slate-405 text-sm mt-4 leading-relaxed">
                    Aseguramos la máxima calidad en cada una de las fases de obra, desde el plano inicial hasta la entrega de la llave en mano.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  
                  {/* Card 1 */}
                  <div className="bg-[#121622] rounded-xl p-6 border border-slate-800/80 hover:border-slate-650 transition flex flex-col justify-between">
                    <div>
                      <div className="h-12 w-12 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center text-[#B58A63] mb-4">
                        <Building className="h-6 w-6" />
                      </div>
                      <h3 className="font-extrabold text-slate-100 uppercase text-sm tracking-wider">Construcción Steel Frame</h3>
                      <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                        Desarrollo integral de proyectos nuevos con perfiles y herrajes homologados bajo normas IRAM, garantizando máxima estabilidad estructural.
                      </p>
                    </div>
                  </div>

                  {/* Card 2 */}
                  <div className="bg-[#121622] rounded-xl p-6 border border-slate-800/80 hover:border-slate-650 transition flex flex-col justify-between">
                    <div>
                      <div className="h-12 w-12 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center text-[#B58A63] mb-4">
                        <Home className="h-6 w-6" />
                      </div>
                      <h3 className="font-extrabold text-slate-100 uppercase text-sm tracking-wider">Ampliaciones</h3>
                      <p className="text-slate-400 text-xs mt-3 leading-wider">
                        Añade plantas o metros sin demoler lo existente. Ideal por su ligereza y rapidez, minimizando ruidos molestos.
                      </p>
                    </div>
                  </div>

                  {/* Card 3 */}
                  <div className="bg-[#121622] rounded-xl p-6 border border-slate-800/80 hover:border-slate-650 transition flex flex-col justify-between">
                    <div>
                      <div className="h-12 w-12 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center text-[#B58A63] mb-4">
                        <Hammer className="h-6 w-6" />
                      </div>
                      <h3 className="font-extrabold text-slate-100 uppercase text-sm tracking-wider">Remodelaciones</h3>
                      <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                        Revestimientos y rediseños interiores usando tabiquería de alto impacto acústico y placas cementicias de alto tránsito.
                      </p>
                    </div>
                  </div>

                  {/* Card 4 */}
                  <div className="bg-[#121622] rounded-xl p-6 border border-slate-800/80 hover:border-slate-650 transition flex flex-col justify-between">
                    <div>
                      <div className="h-12 w-12 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center text-[#B58A63] mb-4">
                        <Key className="h-6 w-6" />
                      </div>
                      <h3 className="font-extrabold text-slate-100 uppercase text-sm tracking-wider">Proyectos Llave en Mano</h3>
                      <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                        Gestión burocrática del permiso, cálculo de ingeniería, platea de hormigón, montajes e instalaciones de gas y electricidad con instaladores matriculados.
                      </p>
                    </div>
                  </div>

                </div>

              </div>
            </section>

            {/* VENTAJAS DEL STEEL FRAME */}
            <section id="advantages" className="py-24 bg-[#0A0D14] border-t border-slate-900 relative">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                
                <div className="text-center max-w-3xl mx-auto mb-16">
                  <span className="text-[#D69E2E] text-xs font-extrabold tracking-widest uppercase font-mono block">BENEFICIOS INDUSTRIALES</span>
                  <h2 className="text-3xl sm:text-5xl font-black uppercase text-slate-100 tracking-tight mt-1">Ventajas del Steel Frame</h2>
                  <div className="h-1 w-16 bg-[#8B5A2B] mx-auto mt-3 rounded"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  
                  <div className="bg-gradient-to-br from-[#121622] to-[#07090E] p-6 rounded-xl border border-slate-850">
                    <h3 className="font-bold text-slate-100 text-base">⏱ Construcción ultra rápida</h3>
                    <p className="text-slate-400 text-xs mt-2.5 leading-relaxed">
                      Reduce los plazos de entrega hasta en un 60% comparado con ladrillo tradicional. No hay tiempos muertos de fragüe húmedo.
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-[#121622] to-[#07090E] p-6 rounded-xl border border-slate-850">
                    <h3 className="font-bold text-slate-100 text-base">⚡ Mayor eficiencia energética</h3>
                    <p className="text-slate-400 text-xs mt-2.5 leading-relaxed">
                      Ahorra hasta un 60% en luz y gas. La aislación térmica continua reduce significativamente la necesidad de aire acondicionado o calefacción.
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-[#121622] to-[#07090E] p-6 rounded-xl border border-slate-850">
                    <h3 className="font-bold text-slate-100 text-base">🌱 Menor impacto ambiental</h3>
                    <p className="text-slate-400 text-xs mt-2.5 leading-relaxed">
                      Ahorro de agua durante la edificación. Los componentes metálicos son 100% reciclables y limpios para el medio ambiente.
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-[#121622] to-[#07090E] p-6 rounded-xl border border-slate-850">
                    <h3 className="font-bold text-slate-100 text-base">🔥 Excelente aislamiento termoacústico</h3>
                    <p className="text-slate-400 text-xs mt-2.5 leading-relaxed">
                      Los rellenos de lana de vidrio de alta densidad o EPS absorben las frecuencias del sonido exterior garantizando calma absoluta.
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-[#121622] to-[#07090E] p-6 rounded-xl border border-slate-850">
                    <h3 className="font-bold text-slate-100 text-base">📐 Mayor precisión estructural</h3>
                    <p className="text-slate-400 text-xs mt-2.5 leading-relaxed">
                      Perfiles de acero galvanizado controlados computarizadamente. Las paredes quedan milimétricamente rectas y listas para pintar.
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-[#121622] to-[#07090E] p-6 rounded-xl border border-slate-850">
                    <h3 className="font-bold text-slate-100 text-base">💵 Reducción de costos a largo plazo</h3>
                    <p className="text-slate-400 text-xs mt-2.5 leading-relaxed">
                      Al acotar la duración de la obra, disminuyen los costos financieros e indirectos. Presupuestos fijos garantizados de antemano.
                    </p>
                  </div>

                </div>

              </div>
            </section>

            {/* OBRAS REALIZADAS - GALERÍA */}
            <section id="works" className="py-24 bg-[#07090E] relative">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
                  <div>
                    <span className="text-[#D69E2E] text-xs font-extrabold tracking-widest uppercase font-mono block">NUESTRO PORTFOLIO</span>
                    <h2 className="text-3xl sm:text-5xl font-black uppercase text-slate-100 tracking-tight mt-1">Obras Realizadas</h2>
                    <div className="h-1 w-16 bg-[#8B5A2B] mt-3 rounded"></div>
                  </div>

                  {/* Filter buttons */}
                  <div className="flex flex-wrap gap-2.5">
                    {["Todas", "Viviendas", "Comerciales", "Ampliaciones", "Remodelaciones"].map((cat) => (
                      <button 
                        key={cat} 
                        onClick={() => setWorkFilter(cat)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                          workFilter === cat 
                          ? "bg-[#8B5A2B] text-slate-100 border border-[#B58A63]" 
                          : "bg-slate-900 text-slate-400 border border-slate-850 hover:text-white"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredWorks.map((work) => (
                    <div 
                      key={work.id || work.title} 
                      className="bg-[#111622] rounded-xl overflow-hidden border border-slate-800/80 hover:border-slate-700/60 transition group cursor-pointer"
                      onClick={() => setSelectedWorkImage(work.imageUrl)}
                    >
                      <div className="relative h-64 overflow-hidden bg-slate-900">
                        <img 
                          src={work.imageUrl} 
                          alt={work.title} 
                          className="w-full h-full object-cover transition duration-500 group-hover:scale-105" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#07090E]/90 via-[#07090E]/40 to-transparent opacity-80 group-hover:opacity-90 transition duration-300"></div>
                        
                        <div className="absolute top-3 left-3 bg-[#1C2434]/90 text-[#F9FAFB] border border-[#B58A63] text-[9px] uppercase font-bold py-0.5 px-2.5 rounded-full">
                          {work.category}
                        </div>

                        {/* View overlay icon */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300">
                          <span className="bg-slate-950/80 p-3 rounded-full border border-slate-700 text-slate-100">
                            <Eye className="h-5 w-5" />
                          </span>
                        </div>
                      </div>

                      <div className="p-5">
                        <h3 className="font-extrabold text-slate-100 uppercase text-sm tracking-wider leading-5 line-clamp-1 group-hover:text-[#D69E2E] transition">
                          {work.title}
                        </h3>
                        <p className="text-slate-400 text-xs mt-1 font-mono flex items-center gap-1">
                          <span>📍 {work.location || 'S/D'}</span>
                          <span className="text-slate-500">•</span>
                          <span>📅 {work.date || 'S/D'}</span>
                        </p>
                        <p className="text-slate-400 text-xs mt-2.5 line-clamp-2 leading-relaxed">{work.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </section>

            {/* TESTIMONIALS CAROUSEL */}
            <section id="testimonials" className="py-24 bg-[#0A0D14] border-t border-slate-900 relative">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                
                <div className="text-center max-w-3xl mx-auto mb-16">
                  <span className="text-[#D69E2E] text-xs font-extrabold tracking-widest uppercase font-mono block">OPINIÓN DE CLIENTES</span>
                  <h2 className="text-3xl sm:text-5xl font-black uppercase text-slate-100 tracking-tight mt-1">Clientes Felices</h2>
                  <div className="h-1 w-16 bg-[#8B5A2B] mx-auto mt-3 rounded"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {displayTestimonials.map((test) => (
                    <div key={test.id || test.name} className="bg-gradient-to-b from-[#121622] to-slate-950 p-6 sm:p-8 rounded-xl border border-slate-850 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center text-amber-500 text-sm mb-4">
                          {Array.from({ length: test.rating }).map((_, i) => (
                            <Star key={i} className="h-4 w-4 fill-current inline-block" />
                          ))}
                        </div>
                        <p className="text-slate-400 text-xs sm:text-sm leading-relaxed italic mb-6">
                          "{test.review}"
                        </p>
                      </div>

                      <div className="flex items-center gap-3.5 border-t border-slate-900 pt-4">
                        <img 
                          src={test.photoUrl || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=120"} 
                          alt={test.name} 
                          className="h-11 w-11 rounded-full object-cover border border-slate-800 bg-slate-800 shrink-0" 
                        />
                        <div>
                          <strong className="text-slate-100 text-sm font-extrabold block">{test.name}</strong>
                          <span className="text-[10px] text-[#B58A63] font-mono uppercase tracking-wider">{test.projectTitle}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Client Review Submission Form */}
                <div id="add-opinion-section" className="mt-16 max-w-xl mx-auto text-center">
                  {!isClientFormOpen ? (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setIsClientFormOpen(true)}
                      className="px-6 py-3 bg-[#B58A63] hover:bg-[#8B5A2B] text-slate-100 font-extrabold text-xs uppercase tracking-wider rounded-lg shadow-lg hover:shadow-xl transition duration-200 inline-flex items-center gap-2"
                    >
                      <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" /> ¡Dejanos tu Opinión!
                    </motion.button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-b from-[#111622] to-slate-950 p-6 sm:p-8 rounded-xl border border-[#B58A63]/30 text-left relative"
                    >
                      <button
                        type="button"
                        onClick={() => setIsClientFormOpen(false)}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition"
                      >
                        <X className="h-5 w-5" />
                      </button>

                      <h3 className="text-lg font-extrabold uppercase text-slate-100 tracking-wider mb-1 flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-[#B58A63]" />
                        Contanos tu experiencia
                      </h3>
                      <p className="text-slate-400 text-xs mb-6">Tu testimonio ayuda a otros clientes a conocer la calidad de Tao Chi Servicio Integral.</p>

                      <form onSubmit={handleClientSubmitTestimonial} className="space-y-4 font-sans">
                        <div>
                          <label className="block text-slate-300 text-[11px] font-mono uppercase tracking-wider mb-1.5 font-bold">Tu Nombre y Apellido *</label>
                          <input 
                            type="text"
                            required
                            placeholder="Ej. Juan Pérez"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            className="w-full bg-[#0A0D14] border border-slate-800 focus:border-[#B58A63] focus:outline-none rounded-lg py-2.5 px-4 text-slate-100 text-sm placeholder:text-slate-600 transition"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-slate-300 text-[11px] font-mono uppercase tracking-wider mb-1.5 font-bold">Proyecto realizado (Opcional)</label>
                            <input 
                              type="text"
                              placeholder="Ej. Remodelación Casa Nordelta"
                              value={clientProjectTitle}
                              onChange={(e) => setClientProjectTitle(e.target.value)}
                              className="w-full bg-[#0A0D14] border border-slate-800 focus:border-[#B58A63] focus:outline-none rounded-lg py-2.5 px-4 text-slate-100 text-sm placeholder:text-slate-600 transition"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-300 text-[11px] font-mono uppercase tracking-wider mb-1.5 font-bold">Calificación *</label>
                            <div className="flex items-center gap-1.5 h-[42px]">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  type="button"
                                  key={star}
                                  onClick={() => setClientRating(star)}
                                  className="focus:outline-none transition"
                                >
                                  <Star 
                                    className={`h-6 w-6 transition duration-150 ${
                                      star <= clientRating 
                                        ? 'text-amber-500 fill-amber-500 scale-110' 
                                        : 'text-slate-600 hover:text-slate-400 hover:scale-105'
                                    }`} 
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-slate-300 text-[11px] font-mono uppercase tracking-wider mb-1.5 font-bold">Foto de perfil (URL de imagen - Opcional)</label>
                          <input 
                            type="url"
                            placeholder="https://images.unsplash.com/... o dejá en blanco"
                            value={clientPhotoUrl}
                            onChange={(e) => setClientPhotoUrl(e.target.value)}
                            className="w-full bg-[#0A0D14] border border-slate-800 focus:border-[#B58A63] focus:outline-none rounded-lg py-2.5 px-4 text-slate-100 text-sm placeholder:text-slate-600 transition"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-300 text-[11px] font-mono uppercase tracking-wider mb-1.5 font-bold">Tu Opinión / Comentario *</label>
                          <textarea 
                            required
                            rows={3}
                            placeholder="Contanos qué te pareció nuestro servicio integral de diseño y construcción..."
                            value={clientReview}
                            onChange={(e) => setClientReview(e.target.value)}
                            className="w-full bg-[#0A0D14] border border-slate-800 focus:border-[#B58A63] focus:outline-none rounded-lg py-2.5 px-4 text-slate-100 text-sm placeholder:text-slate-600 transition resize-none"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setIsClientFormOpen(false)}
                            className="px-4 py-2 border border-slate-800 text-slate-400 hover:text-slate-100 font-bold text-xs uppercase tracking-wider rounded-lg transition"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="px-5 py-2.5 bg-[#B58A63] hover:bg-[#8B5A2B] text-slate-100 font-extrabold text-xs uppercase tracking-wider rounded-lg shadow-lg hover:shadow-xl transition flex items-center gap-2"
                          >
                            <Send className="h-3.5 w-3.5" /> Enviar Opinión
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  )}
                </div>

              </div>
            </section>

            {/* INSTAGRAM EMULATED COMPONENT */}
            <section id="instagram" className="py-24 bg-[#07090E] relative overflow-hidden">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                
                <div className="text-center max-w-3xl mx-auto mb-16">
                  <span className="text-[#D69E2E] text-xs font-extrabold tracking-widest uppercase font-mono block">REDES SOCIALES</span>
                  <h2 className="text-3xl sm:text-5xl font-black uppercase text-slate-100 tracking-tight mt-1">Seguinos en Instagram</h2>
                  <div className="h-1 w-16 bg-[#8B5A2B] mx-auto mt-3 rounded"></div>
                  <a 
                    href={displayWebContent.instagramUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#D69E2E] hover:underline font-bold text-xs mt-3 flex items-center justify-center gap-1.5"
                  >
                    <Instagram className="h-4 w-4" /> @taochiserviciointegral
                  </a>
                </div>

                {/* Emulated feed in brushed titanium panel block */}
                <div className="bg-[#111622] rounded-2xl p-6 border border-slate-800/80 shadow-2xl">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    
                    <a href={displayWebContent.instagramUrl} target="_blank" rel="noopener noreferrer" className="relative group rounded-lg overflow-hidden h-52 bg-slate-800 block">
                      <img src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=600" alt="Insta 1" className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200">
                        <span className="text-xs text-slate-100 font-bold">♥ Ver publicación</span>
                      </div>
                    </a>

                    <a href={displayWebContent.instagramUrl} target="_blank" rel="noopener noreferrer" className="relative group rounded-lg overflow-hidden h-52 bg-slate-800 block">
                      <img src="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&q=80&w=600" alt="Insta 2" className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200">
                        <span className="text-xs text-slate-100 font-bold">♥ Ver publicación</span>
                      </div>
                    </a>

                    <a href={displayWebContent.instagramUrl} target="_blank" rel="noopener noreferrer" className="relative group rounded-lg overflow-hidden h-52 bg-slate-800 block">
                      <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=600" alt="Insta 3" className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200">
                        <span className="text-xs text-slate-100 font-bold">♥ Ver publicación</span>
                      </div>
                    </a>

                    <a href={displayWebContent.instagramUrl} target="_blank" rel="noopener noreferrer" className="relative group rounded-lg overflow-hidden h-52 bg-slate-800 block">
                      <img src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&q=80&w=600" alt="Insta 4" className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200">
                        <span className="text-xs text-slate-100 font-bold">♥ Ver publicación</span>
                      </div>
                    </a>

                  </div>
                </div>

              </div>
            </section>

            {/* CONTACT / BUDGET REQUEST FORM */}
            <section id="contact" className="py-24 bg-[#0A0D14] border-t border-slate-900 relative">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  
                  {/* Left guide text */}
                  <div className="space-y-6">
                    <div className="inline-block">
                      <span className="text-[#D69E2E] text-xs font-extrabold tracking-widest uppercase font-mono block">CONTACTO DIRECTO</span>
                      <h2 className="text-3xl sm:text-5xl font-black uppercase text-slate-100 tracking-tight mt-1">Solicitá tu Presupuesto</h2>
                      <div className="h-1 w-16 bg-[#8B5A2B] mt-3 rounded"></div>
                    </div>

                    <p className="text-slate-400 text-sm leading-relaxed">
                      Escríbenos detallando tu idea espacial. Te contactaremos dentro de las primeras 24 horas hábiles para coordinar un replanteo técnico en el lote con nuestros ingenieros.
                    </p>

                    <div className="space-y-4 pt-6 border-t border-slate-900">
                      <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-[#B58A63]" />
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block font-bold">WhatsApp Directo</span>
                          <a href={`https://wa.me/${displayWebContent.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="text-slate-205 text-sm font-semibold hover:underline">
                            +{displayWebContent.whatsappNumber}
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Instagram className="h-5 w-5 text-[#B58A63]" />
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block font-bold">Nuestro Perfil Social</span>
                          <a href={displayWebContent.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-slate-205 text-sm font-semibold hover:underline">
                            Instagram Feed
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Form container */}
                  <div id="contact-form-container" className="bg-[#111622] rounded-2xl p-6 sm:p-8 border border-slate-800/80 shadow-2xl relative">
                    
                    {formSuccess ? (
                      <div className="text-center py-12">
                        <div className="h-12 w-12 rounded-full bg-emerald-950/40 border border-emerald-500 flex items-center justify-center text-emerald-400 mx-auto mb-4">
                          <Check className="h-6 w-6" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-100">¡Presupuesto Solicitado con Éxito!</h3>
                        <p className="text-slate-400 text-xs mt-2 max-w-sm mx-auto leading-relaxed">
                          La consulta fue cargada correctamente en nuestra bandeja. Un oficial de TAO-CHI se comunicará en breve por teléfono o correo.
                        </p>
                        <button 
                          onClick={() => setFormSuccess(false)}
                          className="mt-6 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs px-4 py-2 rounded-lg transition"
                        >
                          Enviar otra Solicitud
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleContactSubmit} className="space-y-4">
                        
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Nombre Completo *</label>
                          <input 
                            type="text"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2.5 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                            placeholder="Ej: Daniel Carbonell"
                            required
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Teléfono Móvil *</label>
                            <input 
                              type="tel"
                              value={contactPhone}
                              onChange={(e) => setContactPhone(e.target.value)}
                              className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2.5 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none font-mono"
                              placeholder="Ej: +541122334455"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Correo Electrónico *</label>
                            <input 
                              type="email"
                              value={contactEmail}
                              onChange={(e) => setContactEmail(e.target.value)}
                              className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2.5 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                              placeholder="ejemplo@correo.com"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Localidad de la Obra *</label>
                          <input 
                            type="text"
                            value={contactLocalidad}
                            onChange={(e) => setContactLocalidad(e.target.value)}
                            className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2.5 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none"
                            placeholder="Ej: Funes, Santa Fe"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Cuentanos tu Proyecto *</label>
                          <textarea 
                            value={contactMessage}
                            onChange={(e) => setContactMessage(e.target.value)}
                            rows={4}
                            className="w-full bg-[#07090E] border border-slate-800 rounded-lg py-2.5 px-3 text-slate-100 text-sm focus:border-[#8B5A2B] outline-none resize-none"
                            placeholder="Ej: Deseo construir una casa unifamiliar de 120m2 llave en mano..."
                            required
                          />
                        </div>

                        <button 
                          type="submit"
                          disabled={formSubmitting}
                          className="w-full bg-gradient-to-r from-[#8B5A2B] to-[#5C3A21] hover:brightness-110 text-white font-bold py-3.5 px-4 rounded-lg text-xs uppercase tracking-wider transition border border-[#B58A63] disabled:opacity-50"
                        >
                          {formSubmitting ? "Enviando Solicitud..." : "Solicitar Presupuesto Técnico"}
                        </button>
                      </form>
                    )}

                  </div>

                </div>

              </div>
            </section>

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer id="main-footer" className="bg-[#07090E] border-t border-slate-900 py-12 relative z-10 text-xs text-slate-400 text-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4 flex flex-col items-center">
          <div className="relative h-20 w-20 rounded-full overflow-hidden border border-[#B58A63]/50 shadow-xl">
            <img 
              src="/src/assets/images/tao_chi_logo_1781218764206.jpg" 
              alt="TAO-CHI Logo" 
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="text-slate-300 font-extrabold uppercase tracking-widest text-sm font-sans mt-2">
            TAO-CHI Servicio Integral
          </div>
          <p className="max-w-md mx-auto text-slate-500 leading-relaxed">
            Especialistas Técnicos y Oficiales en Estructuras de Acero Galvanizado Liviano en la República Argentina.
          </p>
          <div className="text-slate-600 font-mono text-[10px] pt-4">
            © {new Date().getFullYear()} TAO-CHI. Todos los derechos reservados. Sistema Steel Frame Certificado de Calidad.
          </div>
        </div>
      </footer>

      {/* LIGHTBOX FOR PORTFOLIO IMAGES */}
      {selectedWorkImage && (
        <div 
          id="lightbox-overlay"
          onClick={() => setSelectedWorkImage(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={selectedWorkImage} alt="Expanded Work" className="max-w-full max-h-[85vh] rounded-lg object-contain shadow-2xl border border-zinc-700" />
            <span className="absolute top-3 right-3 bg-black/70 text-slate-300 rounded-full p-2 hover:text-white">
              ✕ Cerrar
            </span>
          </div>
        </div>
      )}

      {/* FLOATING AI ASSISTANT PANEL (CONNECTED TO n8n / GEMINI) - BOTTOM-LEFT (OPPOSITE CORNER) */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            id="ai-chatbot-drawer"
            initial={{ opacity: 0, y: 35, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-24 left-4 right-4 sm:left-6 sm:right-auto z-50 w-auto sm:w-96 max-w-[calc(100vw-2rem)] h-[480px] sm:h-[540px] bg-[#0A0D14] border border-slate-800/90 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden"
          >
            {/* Wooden Premium Header */}
            <div className="bg-gradient-to-r from-[#8B5A2B] via-[#6F421D] to-[#5C3A21] border-b border-amber-950/45 px-4 py-3.5 flex justify-between items-center text-white shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-black/30 flex items-center justify-center border border-amber-500/25">
                  <Bot className="h-4.5 w-4.5 text-[#D69E2E] animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-100 flex items-center gap-1.5 leading-none font-sans">
                    Asistente IA TAO-CHI
                  </h4>
                  <span className="text-[9px] text-[#E6C39D] font-mono flex items-center gap-1 mt-0.5 font-bold">
                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                    {displayWebContent.n8nWebhookUrl ? "Enlace n8n Activo" : "Red de Respaldo IA"}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                className="text-slate-300 hover:text-white bg-black/20 hover:bg-black/40 h-7 w-7 rounded-full flex items-center justify-center transition duration-200 text-xs cursor-pointer"
                title="Cerrar ventana"
              >
                ✕
              </button>
            </div>

            {/* Chat Conversation Stream */}
            <div className="flex-1 p-4 space-y-3.5 overflow-y-auto bg-[#07090E]/90 flex flex-col custom-scrollbar">
              {chatMessages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`flex flex-col max-w-[85%] ${msg.sender === "user" ? "self-end items-end" : "self-start items-start"}`}
                >
                  <div 
                    className={`p-3 text-xs leading-relaxed rounded-2xl ${
                      msg.sender === "user" 
                        ? "bg-gradient-to-br from-[#8B5A2B] to-[#6F421D] text-slate-50 rounded-tr-none border border-[#B58A63]/30" 
                        : "bg-[#111622] text-slate-200 rounded-tl-none border border-slate-800/80"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono mt-1 px-1">
                    {msg.time}
                  </span>
                </div>
              ))}

              {/* Bouncing Dots typing assistant status loading */}
              {chatLoading && (
                <div className="self-start flex flex-col items-start max-w-[85%]">
                  <div className="bg-[#111622] text-slate-200 p-3 rounded-2xl rounded-tl-none border border-slate-800/80 flex items-center justify-center gap-1.5">
                    <span className="text-slate-400 text-xs mr-1 font-mono">Pensando</span>
                    <span className="h-1.5 w-1.5 bg-[#B58A63] rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="h-1.5 w-1.5 bg-[#B58A63] rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="h-1.5 w-1.5 bg-[#B58A63] rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input form context */}
            <div className="p-3 bg-[#0A0D14] border-t border-slate-850 flex items-center gap-2">
              <input 
                type="text"
                value={userChatInput}
                onChange={(e) => setUserChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendChatMessage();
                }}
                disabled={chatLoading}
                placeholder="Escribí tu consulta técnica aquí..."
                className="flex-1 bg-[#07090E] border border-slate-800 rounded-lg py-2 px-3.5 text-xs text-slate-100 outline-none focus:border-[#8B5A2B] disabled:opacity-40 font-sans"
              />
              <button
                onClick={() => handleSendChatMessage()}
                disabled={!userChatInput.trim() || chatLoading}
                className="bg-gradient-to-r from-[#8B5A2B] to-[#5C3A21] hover:brightness-110 text-white h-8.5 w-8.5 rounded-lg flex items-center justify-center transition border border-[#B58A63]/50 disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FLOATING CHAT TRIGGER BUTTON - BOTTOM-LEFT (OPPOSITE CORNER) */}
      <button
        id="ai-floating-trigger"
        onClick={() => setIsChatOpen(!isChatOpen)}
        className={`fixed bottom-6 left-4 sm:left-6 z-50 bg-[#111622] text-[#B58A63] border-2 ${isChatOpen ? 'border-[#8B5A2B] text-white scale-95' : 'border-[#B58A63]/40 hover:border-[#8B5A2B]'} h-12 w-12 sm:h-14 sm:w-14 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.8)] flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 hover:text-[#E6C39D] transition-all outline-none`}
        title="Consultá con nuestra Inteligencia Artificial"
      >
        <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>

    </div>
  );
}
