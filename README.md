# Jasefly

```{=html}
<p align="center">
```
# AI‑First Modular PHP + React Framework

Build websites, applications and installable platform ecosystems --- not
just another CMS.

**Jasefly** combines a high-performance PHP backend, React frontend,
visual Page Builder, Platform SDK, ZIP modules and MCP-powered AI
workflows into a single developer platform.

[Portfolio](https://iia3uk.ru) • [Documentation](docs/README.md) •
[Installation](INSTALL.md)

```{=html}
</p>
```

------------------------------------------------------------------------

## Why Jasefly?

Most systems stop at being a CMS.

Jasefly treats the CMS as **one application running on top of the
platform**.

The platform itself provides:

-   🧩 Installable ZIP modules
-   🎨 Visual Page Builder
-   🔐 Universal Access Control
-   👥 Capability-based Admin ACL
-   🤖 MCP integration
-   🚀 Shared hosting deployment
-   🛡 Safe Mode & Module Quarantine
-   📦 Public Platform SDK
-   ⚡ AI-first development workflow

------------------------------------------------------------------------

## Architecture

``` text
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

------------------------------------------------------------------------

## Core Philosophy

**Core owns the platform.**

Modules never patch the framework directly.

Every extension talks to the platform through stable SDK contracts.

That allows:

-   independent module releases
-   backwards compatibility
-   safe upgrades
-   AI-generated extensions
-   third-party ecosystems

------------------------------------------------------------------------

## Platform Features

  Area       Highlights
  ---------- ---------------------------------------
  Builder    Visual drag & drop editor
  Runtime    React public rendering
  Backend    PHP REST API
  SDK        Public extension API
  Modules    Install / Update / Rollback / Disable
  Security   Capability ACL + Access Control
  Deploy     Shared-hosting friendly
  AI         MCP build & deployment workflow

------------------------------------------------------------------------

## Module System

ZIP packages can register:

-   Routes
-   Builder widgets
-   Access providers
-   SDK services
-   Admin pages
-   Events
-   Migrations
-   CLI / MCP integrations

If a module crashes during bootstrap, **Module Quarantine** isolates it
automatically without bringing down the entire application.

------------------------------------------------------------------------

## Access Control

One unified engine protects:

-   Pages
-   Sections
-   Widgets
-   API
-   Admin
-   Purchases
-   Memberships
-   Roles
-   Custom providers

The renderer never exposes protected content to guests.

------------------------------------------------------------------------

## Developer Experience

``` bash
setup.bat
start.bat
```

Open:

    http://localhost:5173

Admin:

    /admin

------------------------------------------------------------------------

## Repository

  Folder        Purpose
  ------------- -----------------------
  backend       PHP Core & REST API
  frontend      React runtime & admin
  modules-src   ZIP module sources
  docs          Documentation
  mcp-cms       MCP server
  scripts       Build tools
  content       Demo content

------------------------------------------------------------------------

## Documentation

-   docs/README.md
-   INSTALL.md
-   ARCHITECTURE.md
-   DEVELOPMENT.md
-   CMS_MAP.md
-   docs/platform-sdk.md

------------------------------------------------------------------------

## Roadmap

-   Marketplace
-   Multi-tenant support
-   Visual workflow automation
-   Module Store
-   AI-assisted Builder
-   Collaborative editing

------------------------------------------------------------------------

## Author

Created by **iia3uk**

🌐 Portfolio: https://iia3uk.ru

------------------------------------------------------------------------

## Support Development

If Jasefly saves you time or powers your business, you can support
future development:

❤️ https://pay.cloudtips.ru/p/4cbdc8ab

------------------------------------------------------------------------

## License

See LICENSE.
