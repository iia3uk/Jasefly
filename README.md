# <p align="center">Jasefly</p>

<p align="center">

<img src="logo_full.svg" width="140" alt="Jasefly Logo">

</p>

<h2 align="center">
AI-First Modular PHP + React Framework
</h2>

<p align="center">

Build websites, applications and installable platform ecosystems.<br>
Not just another CMS.

</p>

<p align="center">

<a href="https://iia3uk.ru">Portfolio</a> •
<a href="docs/README.md">Documentation</a> •
<a href="INSTALL.md">Installation</a>

</p>

---

## 🚀 What is Jasefly?

**Jasefly** is a modular PHP + React framework designed to build modern websites, SaaS platforms and extensible applications.

Instead of treating the CMS as the product, **the CMS is only one application running on top of the platform.**

The platform provides everything required to build your own ecosystem:

- 🧩 ZIP Modules
- 🎨 Visual Page Builder
- 🔐 Universal Access Control
- 👥 Capability-based Admin
- 🤖 MCP Integration
- 📦 Platform SDK
- 🛡 Safe Mode & Module Quarantine
- ⚡ AI-first architecture

---

# ✨ Features

| | |
|---|---|
| 🎨 Builder | Visual drag & drop page editor |
| ⚡ Runtime | Fast PHP API + React frontend |
| 🧩 Modules | Installable ZIP packages |
| 🔌 SDK | Stable public Platform SDK |
| 🔐 Access | Universal Access Control engine |
| 👥 Admin | WordPress-like capability system |
| 🤖 MCP | AI deployment & automation |
| 🚀 Deploy | Shared hosting friendly |
| 🛡 Recovery | Safe Mode & Module Quarantine |

---

# 🏗 Architecture

```text
                 React Frontend
        Public Site • Admin • Builder
                       │
                   REST API
                       │
               Platform Services
                       │
      SDK • Events • Access • Builder
                       │
           ZIP Modules / Core Packages
                       │
        Bootstrap • Router • Database
```

---

# 🧩 Platform Philosophy

Unlike traditional CMS systems:

```
CMS
└── Everything depends on CMS
```

Jasefly works differently:

```
Platform
├── CMS
├── Landing
├── CRM
├── Blog
├── Shop
├── Documentation
└── Your own applications
```

The CMS is simply another platform application.

---

# 📦 ZIP Module System

Modules can register:

- Builder widgets
- REST routes
- SDK services
- Events
- Admin pages
- Migrations
- Access providers
- MCP commands

Every module is isolated.

If one crashes during bootstrap it is automatically quarantined without taking down the entire application.

---

# 🔐 Universal Access Control

One engine controls access to:

- Pages
- Sections
- Widgets
- API
- Purchases
- Memberships
- Roles
- Groups
- Wallets
- Custom providers

Supports:

- `all`
- `any`
- `not`

Content is filtered **server-side**, preventing hidden data from leaking into the browser.

---

# 👥 Capability-based Admin

Inspired by WordPress but redesigned for modular platforms.

Features:

- Multiple roles
- Unlimited capabilities
- Allow / Deny overrides
- Dynamic navigation
- ZIP modules register permissions automatically
- API authorization
- Builder authorization
- Future multi-tenant support

No hardcoded role names inside the Core.

---

# 🛡 Module Safety

Jasefly protects itself automatically.

If a module fails because of:

- Exception
- Missing dependency
- SDK mismatch
- Bootstrap timeout
- Memory limit
- Route conflicts
- Migration failure

…it enters **Quarantine Mode**.

The platform continues running.

---

# 🤖 Built for AI

Jasefly ships with MCP integration.

Typical workflow:

```text
Build
   ↓
Tests
   ↓
Deploy
   ↓
Verify
```

AI agents can:

- build modules
- publish releases
- manage content
- install packages
- inspect runtime
- automate deployments

---

# 📂 Repository Structure

| Folder | Description |
|---------|-------------|
| backend | PHP Core & REST API |
| frontend | React runtime & admin |
| modules-src | ZIP module sources |
| docs | Technical documentation |
| mcp-cms | MCP server |
| scripts | Build tools |
| content | Content templates |

---

# 🚀 Quick Start

Windows

```bash
setup.bat
start.bat
```

Open:

```
http://localhost:5173
```

Admin:

```
/admin
```

Installation guide:

```
INSTALL.md
```

---

# 📚 Documentation

- docs/README.md
- INSTALL.md
- ARCHITECTURE.md
- DEVELOPMENT.md
- CMS_MAP.md
- docs/platform-sdk.md

---

# 🗺 Roadmap

- Marketplace
- Module Store
- AI Builder Assistant
- Visual Workflow Automation
- Multi-tenant Platform
- Realtime Collaboration

---

# ❤️ Support

If Jasefly saves you time or powers your business, consider supporting development.

☕

https://pay.cloudtips.ru/p/4cbdc8ab

---

# 👨‍💻 Author

**iia3uk**

Portfolio

https://iia3uk.ru

---

# ⭐ Star the project

If you like Jasefly, consider giving the repository a ⭐.

It helps the project grow and motivates further development.

---

# 📄 License

See the repository license.
