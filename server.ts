import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Initialize the official Gemini SDK server-side
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
} else {
  console.warn("GEMINI_API_KEY is not defined in environment variables. Gemini fallback will be limited.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parser for API requests
  app.use(express.json());

  // API Route: AI message service connected to n8n with Gemini fallback
  app.post("/api/n8n-chat", async (req, res) => {
    const { message, history, n8nWebhookUrl, aiSystemInstruction } = req.body;

    if (!message) {
      return res.status(400).json({ error: "El mensaje del usuario es obligatorio." });
    }

    let responded = false;
    let responseText = "";
    let source = "gemini-fallback";

    // 1. Attempt to send to n8n Webhook if configured
    if (n8nWebhookUrl && n8nWebhookUrl.trim().startsWith("http")) {
      try {
        console.log(`Forwarding message to n8n Webhook: ${n8nWebhookUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout for quick fallback

        const n8nResponse = await fetch(n8nWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            message,
            history: history || [],
            source: "tao-chi-web-assistant",
            timestamp: new Date().toISOString()
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (n8nResponse.ok) {
          const contentType = n8nResponse.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const data = await n8nResponse.json();
            console.log("n8n responded with JSON:", data);

            // Parse common n8n JSON output patterns
            if (typeof data === "string") {
              responseText = data;
            } else if (Array.isArray(data) && data.length > 0) {
              const firstItem = data[0];
              responseText = firstItem.output || firstItem.response || firstItem.text || firstItem.message || JSON.stringify(firstItem);
            } else if (data) {
              responseText = data.output || data.response || data.text || data.message || data.msg || JSON.stringify(data);
            }
          } else {
            responseText = await n8nResponse.text();
            console.log("n8n responded with Raw Text:", responseText);
          }

          if (responseText && responseText.trim().length > 0) {
            responded = true;
            source = "n8n";
          }
        } else {
          console.warn(`n8n webhook returned non-2xx status: ${n8nResponse.status}`);
        }
      } catch (err: any) {
        console.warn("n8n webhook query failed or timed out. Falling back gracefully to server-side Gemini. Error:", err.message);
      }
    }

    // 2. Fallback to Gemini API if n8n was not configured or didn't respond
    if (!responded) {
      if (!ai) {
        // No Gemini API key loaded, use standard helpful text
        responseText = "¡Hola! Gracias por comunicarte con el soporte de TAO-CHI Servicio Integral. En este momento el asistente virtual de inteligencia artificial está completando su enlace. Por favor, escribinos tus dudas directamente a nuestro WhatsApp oficial o rellená el formulario de contacto para recibir un presupuesto técnico detallado llave en mano.";
        source = "local-template";
      } else {
        try {
          console.log("Querying server-side Gemini 3.5 Flash fallback...");
          // Map history to official schema required by chats in @google/genai
          // Format for contents or chat: array of { role: 'user'|'model', parts: [{ text: '...' }] }
          const formattedContents: any[] = [];
          
          if (history && Array.isArray(history)) {
            // Keep last 6 exchanges to prevent flooding the context limit
            const slicedHistory = history.slice(-6);
            slicedHistory.forEach((h: any) => {
              formattedContents.push({
                role: h.sender === "user" ? "user" : "model",
                parts: [{ text: h.text }]
              });
            });
          }
          
          // Push current user message
          formattedContents.push({
            role: "user",
            parts: [{ text: message }]
          });

          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: formattedContents,
            config: {
              systemInstruction: aiSystemInstruction || "Sos el asistente técnico virtual oficial de TAO-CHI Servicio Integral, especialista en Steel Framing en Argentina. Responde las preguntas técnicas sobre construcción en seco con cortesía, precisión y entusiasmo, incentivando al usuario a pedir presupuesto formal.",
              temperature: 0.7,
              topP: 0.9,
            }
          });

          responseText = response.text || "Disculpas, no he podido procesar la respuesta. Por favor contactanos a través de WhatsApp.";
          source = "gemini";
        } catch (geminiError: any) {
          console.error("Gemini API error:", geminiError);
          responseText = "Disculpas, nuestro servidor de inteligencia artificial está experimentando una demora. Te invitamos a comunicarte directamente por WhatsApp para asistencia inmediata.";
          source = "error-fallback";
        }
      }
    }

    return res.json({
      response: responseText,
      source: source
    });
  });

  // Serve static assets and handle routing via Vite proxy in dev, or local dist folder in prod
  if (process.env.NODE_ENV !== "production") {
    console.log("Configuring Vite Dev Server middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Configuring Production static asset path...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Full-stack server successfully running on port ${PORT}`);
  });
}

startServer();
