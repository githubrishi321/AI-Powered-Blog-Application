# 📝 Blogify — AI-Powered Blog Application

> A full-stack blogging platform where you can create, read, and share blogs — with a built-in **AI Tone Converter** powered by Groq (LLaMA 3.3).

---

## 📌 Description

**Blogify** is a full-stack web application that lets users sign up, write and publish blogs, upload cover images, and interact through comments. What makes Blogify stand out is its **AI Tone Converter** — a special feature that rewrites your blog content in different styles using the Groq AI API with the LLaMA 3.3 model.

---

## ✨ Features

- 🔐 **User Authentication** — Secure sign up, sign in, and logout using JWT (JSON Web Tokens) stored in HTTP-only cookies
- 📝 **Blog Management** — Create and read blog posts with title, body, and optional cover image
- 🖼️ **Image Uploads** — Upload cover images for your blogs using Multer
- 💬 **Comments** — Authenticated users can comment on any blog post
- 🤖 **AI Tone Converter** *(Unique Feature)* — Rewrite blog content in 5 different AI-powered tones using Groq API
- 🔒 **Secure Password Hashing** — Passwords are hashed using Node.js `crypto` (HMAC SHA-256) before storing
- 🌐 **Deployed on Render** — Production-ready with proper environment variable handling

---

## 🤖 AI Tone Converter *(Unique Selling Point)*

This is the **star feature** of Blogify. Using the **Groq API** (powered by the `llama-3.3-70b-versatile` model), users can paste or use their blog content and instantly convert it into different writing tones.

### 🎨 Available Tones

| Tone | Description |
|---|---|
| 🏢 **Professional** | Formal, authoritative language for a business audience |
| 😊 **Casual** | Relaxed, conversational tone — like talking to a friend |
| 📱 **Social** | Punchy and engaging, with hashtags — perfect for social media |
| 🙏 **Polite** | Warm, respectful, and courteous tone |
| 😄 **Emojify** | Original content enriched with relevant emojis |

### 🔌 How It Works

1. The user selects a tone and submits their blog text via the blog detail page.
2. A `POST /ai/tone` API request is made with `{ text, tone }` in the request body.
3. The `services/ai.js` module sends the text to the **Groq API** with a custom system prompt tailored to the selected tone.
4. The rewritten content is returned and displayed to the user in real-time.

```
POST /ai/tone
Body: { "text": "Your blog content...", "tone": "professional" }
Response: { "result": "Rewritten blog content in professional tone..." }
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js** | Backend runtime |
| **Express.js v5** | Web framework and routing |
| **MongoDB + Mongoose** | Database and ODM |
| **EJS** | Server-side templating (views) |
| **Multer** | File/image upload handling |
| **JSON Web Tokens (JWT)** | User authentication |
| **Cookie-Parser** | Parsing JWT from cookies |
| **Groq SDK** | AI tone conversion (LLaMA 3.3 model) |
| **dotenv** | Environment variable management |
| **Render** | Cloud deployment platform |

---

## 📸 Screenshots

> *(Add your screenshots here)*

| Home Page | Blog Post | AI Tone Converter |
|---|---|---|
| ![Home](./public/screenshots/home.png) | ![Blog](./public/screenshots/blog.png) | ![AI Tone](./public/screenshots/ai-tone.png) |

---

## ⚙️ Installation & Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or above)
- [MongoDB](https://www.mongodb.com/) (local or MongoDB Atlas)
- A [Groq API Key](https://console.groq.com/) (free to get)

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/githubrishi321/Blog-Application.git
   cd Blog-Application
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a `.env` file** in the root directory with the following variables:
   ```env
   PORT=8000
   NODE_ENV=development
   MONGO_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/blogdb
   JWT_SECRET=your_jwt_secret_key
   PASSWORD_SALT=your_password_salt
   GROQ_API_KEY=your_groq_api_key
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:8000
   ```

---

## 🚀 Usage

1. **Sign Up** — Create a new account at `/user/signup`
2. **Sign In** — Log into your account at `/user/signin`
3. **Create a Blog** — Click "Add New Blog", fill in the title, body, and optionally upload a cover image
4. **Read Blogs** — Browse all blogs on the home page; click any to read the full post
5. **Comment** — Leave a comment on any blog post (must be signed in)
6. **Use AI Tone Converter** — On any blog detail page, paste text, select a tone, and click convert

---

## 📁 Folder Structure

```
Blogify/
├── app.js                  # Main application entry point
├── package.json            # Project dependencies and scripts
├── .env                    # Environment variables (not committed)
├── .gitignore
├── render.yaml             # Render deployment config
│
├── models/                 # Mongoose database schemas
│   ├── user.js             # User model (auth, hashing)
│   ├── blog.js             # Blog model
│   └── comment.js          # Comment model
│
├── routes/                 # Express route handlers
│   ├── user.js             # Signup, signin, logout routes
│   ├── blog.js             # Blog CRUD and comment routes
│   └── ai.js               # AI tone conversion route
│
├── services/               # Business logic and external APIs
│   ├── ai.js               # Groq API integration (tone converter)
│   └── authentication.js   # JWT token creation & validation
│
├── middlewares/            # Express middleware
│   └── authentication.js   # Auth cookie middleware
│
├── views/                  # EJS templates (frontend)
│   ├── home.ejs
│   ├── blog.ejs
│   ├── addBlog.ejs
│   ├── signin.ejs
│   ├── signup.ejs
│   ├── error.ejs
│   └── partials/
│
└── public/                 # Static assets (CSS, images, uploads)
    └── uploads/            # User-uploaded blog cover images
```

---

## 🔮 Future Improvements

- [ ] 📊 **User Dashboard** — View all blogs created by the logged-in user
- [ ] ✏️ **Edit & Delete Blogs** — Allow users to manage their own posts
- [ ] 👍 **Like / Bookmark System** — Let users save favourite blogs
- [ ] 🔍 **Search & Filter** — Search blogs by title, category, or author
- [ ] 📧 **Email Verification** — Verify user emails on signup
- [ ] 🌙 **Dark Mode** — Toggle between light and dark themes
- [ ] 📎 **Rich Text Editor** — Replace plain text input with a WYSIWYG editor
- [ ] 🗂️ **Blog Categories / Tags** — Organise blogs by topic

---

## 👨‍💻 Author

**Rishi** — [@githubrishi321](https://github.com/githubrishi321)

> Built with ❤️ using Node.js, Express, MongoDB, and Groq AI.

---

## 📄 License

This project is open source and available under the [ISC License](./LICENSE).
