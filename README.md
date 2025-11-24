# 📁 WA-Image-Downloader  
Bot de WhatsApp creado con **Baileys** que permite capturar imágenes enviadas por los usuarios y almacenarlas automáticamente en carpetas definidas mediante mensajes de texto.

El flujo es simple:
1. El usuario envía un mensaje de texto → este será el **nombre de la carpeta**.
2. El usuario envía imágenes.
3. El bot descarga cada imagen y la guarda en la carpeta indicada.

Ideal para clasificar fotos rápidamente, recolectar datasets o automatizar flujos de trabajo que implican imágenes.

---

## ✨ Características

- 🔐 Autenticación persistente con Multi-File Auth  
- 📲 Generación manual del QR (compatible con cambios recientes en Baileys)  
- 🖼️ Descarga automática de imágenes  
- 📁 Organización por carpetas según texto enviado  
- 💾 Guarda las imágenes en `/images/<nombre-carpeta>/`

---

## 📦 Requisitos

- Node.js 16+  
- NPM o PNPM  
- WhatsApp en tu teléfono  
- Librerías principales:
  - `@whiskeysockets/baileys`
  - `fs-extra`
  - `qrcode-terminal`

---

## 🚀 Instalación

```bash
git clone https://github.com/Andres-Casillas/WA-Image-Downloader
cd WA-Image-Downloader
npm install
