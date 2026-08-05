import re
from pathlib import Path

oa = Path(r"F:/JASEFLY_CMS/contracts/openapi/jasefly.v1.yaml").read_text(encoding="utf-8")
paths = re.findall(r"^  (/[a-zA-Z0-9_{}/-]+):", oa, re.M)
print("openapi_paths", len(paths), paths)

php_routes = 0
for p in Path(r"F:/JASEFLY_CMS/backend/src/Modules").rglob("*Module.php"):
    t = p.read_text(encoding="utf-8", errors="ignore")
    php_routes += len(re.findall(r"\$router->(get|post|put|patch|delete)\(", t))
print("php_router_calls_approx", php_routes)

node_routes = 0
for p in Path(r"F:/JASEFLY_CMS/runtime-node/src").rglob("*.ts"):
    t = p.read_text(encoding="utf-8", errors="ignore")
    node_routes += sum(t.count(x) for x in ("ctx.app.get", "ctx.app.post", "ctx.app.put", "ctx.app.delete", "app.get(", "app.post(", "app.put(", "app.delete("))
print("node_app_route_calls_approx", node_routes)
