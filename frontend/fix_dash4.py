from pathlib import Path
import re
p = Path(r'C:\portfolio\frontend\src\admin\pages\DashboardPage.tsx')
t = p.read_text(encoding='utf-8')
line = t.splitlines()[136]
print(repr(line))

# Broader fix: adminUrl('/ANYTHING"  -> adminUrl('/ANYTHING')
t2, n = re.subn(r"adminUrl\('([^']+)\"", r"adminUrl('\1')", t)
print('n', n)
# Fix double >> and ')} leftovers
t2 = t2.replace('className="block">>', 'className="block">')
t2 = t2.replace("hover:bg-white/[0.04]')}", 'hover:bg-white/[0.04]">')
t2 = t2.replace("className=\"block')}>", 'className="block">')
# Fix missing } before attrs: adminUrl('x') className= already ok if we have )}
# After sub, we may have to={adminUrl('/messages') className=  without closing }
t2 = re.sub(r"to=\{adminUrl\('([^']+)'\)\s+className=", r"to={adminUrl('\1')} className=", t2)
t2 = re.sub(r"href=\{adminUrl\('([^']+)'\)\s+data=", r"href={adminUrl('\1')} data=", t2)
p.write_text(t2, encoding='utf-8')
print('sample', t2.splitlines()[136])
print('sample2', t2.splitlines()[286])
print('sample3', t2.splitlines()[367])
