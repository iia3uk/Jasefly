# Compatibility Layer

`App\Platform\Compatibility\CompatibilityLayer` adapts SDK generations.

- Wraps `PlatformContext` for the module’s `sdk_version`
- `CompatibilityChecker` + `PackageStaticAnalyzer` produce score / errors / recommendations
- Admin: `GET /admin/modules/{slug}/compatibility`
- MCP: `cms_module_compatibility`, `cms_sdk_report`, `cms_capability_report`
