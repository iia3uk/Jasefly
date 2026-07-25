<?php
declare(strict_types=1);

namespace App\Platform\Analysis;

use App\Platform\Capabilities\ServiceRegistry;

/**
 * Token-based static scan of package sources against sdk-policy.json.
 */
final class PackageStaticAnalyzer
{
    /** @var array<string, mixed> */
    private array $policy;

    /** @var array<string, true> */
    private array $allowedServiceIds;

    public function __construct(?string $policyPath = null)
    {
        $path = $policyPath ?? __DIR__ . '/sdk-policy.json';
        $raw = is_file($path) ? file_get_contents($path) : false;
        $data = is_string($raw) ? json_decode($raw, true) : null;
        $this->policy = is_array($data) ? $data : $this->defaultPolicy();
        $ids = $this->policy['allowed_service_ids'] ?? array_keys(ServiceRegistry::PUBLIC_CATALOG);
        $this->allowedServiceIds = array_fill_keys(array_map('strval', $ids), true);
    }

    /**
     * @return array{
     *   ok:bool,
     *   errors:list<string>,
     *   warnings:list<string>,
     *   files_scanned:int,
     *   findings:list<array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string}>
     * }
     */
    public function analyzeDirectory(string $root): array
    {
        $findings = [];
        $files = 0;
        $root = rtrim(str_replace('\\', '/', $root), '/');
        if (!is_dir($root)) {
            $finding = $this->finding('', 0, 'path', 'critical', 'Directory not found: ' . $root, 'Provide a valid module directory');
            return [
                'ok' => false,
                'errors' => [$finding['message']],
                'warnings' => [],
                'files_scanned' => 0,
                'findings' => [$finding],
            ];
        }

        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $file) {
            if (!$file->isFile()) {
                continue;
            }
            $path = str_replace('\\', '/', $file->getPathname());
            $rel = ltrim(substr($path, strlen($root)), '/');
            $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            if ($ext === 'php') {
                if (str_contains($rel, 'vendor/') || str_contains($rel, 'node_modules/')) {
                    continue;
                }
                $files++;
                $raw = (string) file_get_contents($path);
                $isHook = str_starts_with($rel, 'hooks/');
                $findings = array_merge($findings, $this->scanPhp($rel, $raw, $isHook));
            } elseif (in_array($ext, ['js', 'ts', 'tsx', 'mjs'], true)) {
                if (str_starts_with($rel, 'frontend/') || str_starts_with($rel, 'frontend-dist/')) {
                    $files++;
                    $raw = (string) file_get_contents($path);
                    $findings = array_merge($findings, $this->scanFrontend($rel, $raw));
                }
            }
        }

        return $this->buildReport($findings, $files);
    }

    /**
     * @param list<array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string}> $findings
     * @return array{ok:bool, errors:list<string>, warnings:list<string>, files_scanned:int, findings:list<array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string}>}
     */
    private function buildReport(array $findings, int $filesScanned): array
    {
        $errors = [];
        $warnings = [];
        foreach ($findings as $f) {
            if (in_array($f['severity'], ['critical', 'high'], true)) {
                $errors[] = $f['file'] !== '' ? "{$f['file']}:{$f['line']} {$f['message']}" : $f['message'];
            } else {
                $warnings[] = $f['file'] !== '' ? "{$f['file']}:{$f['line']} {$f['message']}" : $f['message'];
            }
        }

        return [
            'ok' => $errors === [],
            'errors' => $errors,
            'warnings' => $warnings,
            'files_scanned' => $filesScanned,
            'findings' => $findings,
        ];
    }

    /**
     * @return list<array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string}>
     */
    private function scanPhp(string $rel, string $raw, bool $isHook = false): array
    {
        $findings = [];
        $tokens = $this->tokenize($raw);
        $count = count($tokens);

        for ($i = 0; $i < $count; $i++) {
            $tok = $tokens[$i];
            $id = $tok[0];
            $text = $tok[1];
            $line = $tok[2];

            if ($id === T_USE) {
                $fqcn = $this->readUseFqcn($tokens, $i + 1);
                if ($fqcn !== null) {
                    $findings = array_merge($findings, $this->checkForbiddenNamespace($rel, $line, $fqcn, $isHook, $raw));
                }
                continue;
            }

            if ($id === T_NEW) {
                $class = $this->readClassNameAfter($tokens, $i + 1);
                if ($class !== null) {
                    $findings = array_merge($findings, $this->checkClassReference($rel, $line, $class, 'new'));
                }
                continue;
            }

            if ($id === T_EXTENDS || $id === T_IMPLEMENTS) {
                $class = $this->readClassNameAfter($tokens, $i + 1);
                if ($class !== null) {
                    $findings = array_merge($findings, $this->checkClassReference($rel, $line, $class, $id === T_EXTENDS ? 'extends' : 'implements'));
                }
                continue;
            }

            if ($id === T_STRING && ($text === 'extends' || $text === 'implements') && $this->prevNonWhitespace($tokens, $i) === T_ATTRIBUTE) {
                $class = $this->readClassNameAfter($tokens, $i + 1);
                if ($class !== null) {
                    $findings = array_merge($findings, $this->checkClassReference($rel, $line, $class, 'attribute'));
                }
                continue;
            }

            if ($id === T_DOUBLE_COLON) {
                $class = $this->readClassBefore($tokens, $i);
                $method = $this->readIdentifierAfter($tokens, $i + 1);
                if ($class !== null) {
                    $findings = array_merge($findings, $this->checkClassReference($rel, $line, $class, 'static'));
                    $pattern = $class . '::' . ($method ?? '');
                    foreach ($this->forbiddenPatterns() as $needle) {
                        if ($pattern === $needle || ($method !== null && str_starts_with($needle, $class . '::') && str_contains($needle, $method))) {
                            if (str_contains($needle, '::') && $pattern !== $needle) {
                                continue;
                            }
                            $findings[] = $this->finding(
                                $rel,
                                $line,
                                'forbidden_pattern',
                                'critical',
                                "Forbidden pattern {$needle}",
                                'Use PlatformContext typed accessors instead of internal CMS APIs'
                            );
                        }
                    }
                }
                continue;
            }

            if ($id === T_CONSTANT_ENCAPSED_STRING || $id === T_ENCAPSED_AND_WHITESPACE) {
                $literal = $this->stripQuotes($text);
                if ($literal !== null && str_contains($literal, 'App\\')) {
                    foreach ($this->forbiddenNamespaces() as $ns) {
                        if (str_starts_with($literal, $ns)) {
                            $findings[] = $this->finding(
                                $rel,
                                $line,
                                'forbidden_fqcn_string',
                                'critical',
                                "Forbidden FQCN string reference to {$ns}",
                                'Use App\\Platform\\ APIs only'
                            );
                            break;
                        }
                    }
                }
                if ($literal !== null && preg_match('/^class_exists\s*\(/', $this->contextSnippet($tokens, $i))) {
                    foreach ($this->forbiddenNamespaces() as $ns) {
                        if (str_starts_with($literal, $ns)) {
                            $findings[] = $this->finding(
                                $rel,
                                $line,
                                'class_exists_forbidden',
                                'critical',
                                "class_exists() on forbidden namespace {$ns}",
                                'Do not probe internal CMS classes from package code'
                            );
                        }
                    }
                }
                continue;
            }

            if ($id === T_OBJECT_OPERATOR && $this->peekIdentifier($tokens, $i + 1) === 'service') {
                $serviceId = $this->readServiceCallArgument($tokens, $i + 2);
                if ($serviceId !== null && !isset($this->allowedServiceIds[$serviceId])) {
                    $findings[] = $this->finding(
                        $rel,
                        $line,
                        'forbidden_service_id',
                        'critical',
                        "service('{$serviceId}') is not a public Platform service ID",
                        'Use typed PlatformContext accessors (mail(), database(), …) or a catalog ID from sdk-policy allowed_service_ids'
                    );
                }
            }
        }

        foreach ($this->forbiddenPatterns() as $needle) {
            if (!str_contains($needle, '::') && str_contains($raw, $needle)) {
                $findings[] = $this->finding(
                    $rel,
                    $this->lineOfNeedle($raw, $needle),
                    'forbidden_pattern',
                    'critical',
                    "Forbidden pattern {$needle}",
                    'Use PlatformContext instead of direct internal instantiation'
                );
            }
        }

        if (!$isHook && preg_match('/\buse\s+App\\\\(Database|Router|Request|Response)\b/', $raw, $m, PREG_OFFSET_CAPTURE)) {
            $findings[] = $this->finding(
                $rel,
                $this->lineOfOffset($raw, (int) $m[0][1]),
                'legacy_core_use',
                'high',
                'use App\\Database|Router|Request|Response — use PlatformContext instead',
                'Replace with App\\Platform\\Contracts\\* and PlatformContext accessors'
            );
        }

        return $this->dedupeFindings($findings);
    }

    /**
     * @return list<array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string}>
     */
    private function scanFrontend(string $rel, string $raw): array
    {
        $findings = [];
        $lines = preg_split('/\r\n|\n|\r/', $raw) ?: [];
        foreach ($lines as $idx => $lineText) {
            $line = $idx + 1;
            foreach ($this->frontendForbidden() as $needle) {
                if (str_contains($lineText, $needle)) {
                    $findings[] = $this->finding(
                        $rel,
                        $line,
                        'forbidden_frontend_import',
                        'critical',
                        "Forbidden frontend import/reference {$needle}",
                        'Use @jasefly/platform or host register(ctx) — see Platform SDK docs'
                    );
                }
            }
        }
        return $this->dedupeFindings($findings);
    }

    /**
     * @return list<array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string}>
     */
    private function checkForbiddenNamespace(string $rel, int $line, string $fqcn, bool $isHook, string $raw): array
    {
        $findings = [];
        foreach ($this->forbiddenNamespaces() as $ns) {
            if (!str_starts_with($fqcn, $ns)) {
                continue;
            }
            if ($isHook && $ns === 'App\\Core\\' && str_contains($raw, 'ModuleInstallContext')) {
                continue;
            }
            $findings[] = $this->finding(
                $rel,
                $line,
                'forbidden_namespace',
                'critical',
                "Forbidden namespace import {$fqcn}",
                'Import only from App\\Platform\\ or App\\PackageModules\\'
            );
        }
        return $findings;
    }

    /**
     * @return list<array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string}>
     */
    private function checkClassReference(string $rel, int $line, string $class, string $kind): array
    {
        $findings = [];
        $normalized = ltrim($class, '\\');
        foreach ($this->publicNamespaces() as $ok) {
            if (str_starts_with($normalized, $ok)) {
                return [];
            }
        }
        foreach ($this->forbiddenNamespaces() as $ns) {
            if (str_starts_with($normalized, $ns)) {
                $findings[] = $this->finding(
                    $rel,
                    $line,
                    'forbidden_namespace',
                    'critical',
                    "Forbidden {$kind} reference to {$normalized}",
                    'Use App\\Platform\\ contracts and PlatformContext'
                );
            }
        }
        return $findings;
    }

    /** @return list<array{int|string, string, int}> */
    private function tokenize(string $code): array
    {
        if (class_exists(\PhpToken::class)) {
            $out = [];
            foreach (\PhpToken::tokenize($code) as $t) {
                $out[] = [$t->id, $t->text, $t->line];
            }
            return $out;
        }
        $legacy = token_get_all($code);
        $out = [];
        foreach ($legacy as $t) {
            if (is_array($t)) {
                $out[] = [$t[0], $t[1], $t[2]];
            } else {
                $out[] = [ord($t[0]), $t, 0];
            }
        }
        return $out;
    }

    /** @param list<array{int|string, string, int}> $tokens */
    private function readUseFqcn(array $tokens, int $start): ?string
    {
        $parts = [];
        for ($i = $start, $n = count($tokens); $i < $n; $i++) {
            $id = $tokens[$i][0];
            $text = $tokens[$i][1];
            if ($id === T_WHITESPACE) {
                continue;
            }
            if ($id === T_STRING || $id === T_NAME_QUALIFIED || $id === T_NAME_FULLY_QUALIFIED || $id === T_NS_SEPARATOR) {
                $parts[] = $text;
                continue;
            }
            if ($text === '{' || $text === ';' || $text === ',') {
                break;
            }
            if ($id === T_AS) {
                break;
            }
        }
        $fqcn = str_replace(' ', '', implode('', $parts));
        return $fqcn !== '' ? ltrim($fqcn, '\\') : null;
    }

    /** @param list<array{int|string, string, int}> $tokens */
    private function readClassNameAfter(array $tokens, int $start): ?string
    {
        for ($i = $start, $n = count($tokens); $i < $n; $i++) {
            $id = $tokens[$i][0];
            $text = $tokens[$i][1];
            if ($id === T_WHITESPACE || $text === ',') {
                continue;
            }
            if ($id === T_STRING || $id === T_NAME_QUALIFIED || $id === T_NAME_FULLY_QUALIFIED || $id === T_NS_SEPARATOR) {
                return ltrim($this->collectName($tokens, $i), '\\');
            }
            if ($text === '{') {
                return null;
            }
            break;
        }
        return null;
    }

    /** @param list<array{int|string, string, int}> $tokens */
    private function readClassBefore(array $tokens, int $colonsIndex): ?string
    {
        $parts = [];
        for ($i = $colonsIndex - 1; $i >= 0; $i--) {
            $id = $tokens[$i][0];
            $text = $tokens[$i][1];
            if ($id === T_WHITESPACE) {
                continue;
            }
            if ($id === T_STRING || $id === T_NAME_QUALIFIED || $id === T_NAME_FULLY_QUALIFIED || $id === T_NS_SEPARATOR) {
                array_unshift($parts, $text);
                continue;
            }
            break;
        }
        $name = str_replace(' ', '', implode('', $parts));
        return $name !== '' ? ltrim($name, '\\') : null;
    }

    /** @param list<array{int|string, string, int}> $tokens */
    private function readIdentifierAfter(array $tokens, int $start): ?string
    {
        for ($i = $start, $n = count($tokens); $i < $n; $i++) {
            $id = $tokens[$i][0];
            $text = $tokens[$i][1];
            if ($id === T_WHITESPACE) {
                continue;
            }
            if ($id === T_STRING) {
                return $text;
            }
            break;
        }
        return null;
    }

    /** @param list<array{int|string, string, int}> $tokens */
    private function peekIdentifier(array $tokens, int $start): ?string
    {
        for ($i = $start, $n = count($tokens); $i < $n; $i++) {
            $id = $tokens[$i][0];
            $text = $tokens[$i][1];
            if ($id === T_WHITESPACE) {
                continue;
            }
            return $id === T_STRING ? $text : null;
        }
        return null;
    }

    /** @param list<array{int|string, string, int}> $tokens */
    private function readServiceCallArgument(array $tokens, int $start): ?string
    {
        for ($i = $start, $n = count($tokens); $i < $n; $i++) {
            $id = $tokens[$i][0];
            $text = $tokens[$i][1];
            if ($id === T_WHITESPACE) {
                continue;
            }
            if ($text !== '(') {
                return null;
            }
            for ($j = $i + 1; $j < $n; $j++) {
                $tid = $tokens[$j][0];
                $ttext = $tokens[$j][1];
                if ($tid === T_WHITESPACE) {
                    continue;
                }
                if ($tid === T_CONSTANT_ENCAPSED_STRING) {
                    return $this->stripQuotes($ttext);
                }
                return null;
            }
            return null;
        }
        return null;
    }

    /** @param list<array{int|string, string, int}> $tokens */
    private function collectName(array $tokens, int $start): string
    {
        $parts = [];
        for ($i = $start, $n = count($tokens); $i < $n; $i++) {
            $id = $tokens[$i][0];
            $text = $tokens[$i][1];
            if ($id === T_STRING || $id === T_NAME_QUALIFIED || $id === T_NAME_FULLY_QUALIFIED || $id === T_NS_SEPARATOR) {
                $parts[] = $text;
                continue;
            }
            if ($id === T_WHITESPACE) {
                continue;
            }
            break;
        }
        return str_replace(' ', '', implode('', $parts));
    }

    /** @param list<array{int|string, string, int}> $tokens */
    private function prevNonWhitespace(array $tokens, int $index): int|string|null
    {
        for ($i = $index - 1; $i >= 0; $i--) {
            if ($tokens[$i][0] !== T_WHITESPACE) {
                return $tokens[$i][0];
            }
        }
        return null;
    }

    /** @param list<array{int|string, string, int}> $tokens */
    private function contextSnippet(array $tokens, int $index): string
    {
        $start = max(0, $index - 6);
        $parts = [];
        for ($i = $start; $i <= $index; $i++) {
            $parts[] = $tokens[$i][1];
        }
        return implode('', $parts);
    }

    private function stripQuotes(string $text): ?string
    {
        if ($text === '') {
            return null;
        }
        $q = $text[0];
        if (($q === "'" || $q === '"') && str_ends_with($text, $q)) {
            return stripcslashes(substr($text, 1, -1));
        }
        return null;
    }

    private function lineOfNeedle(string $raw, string $needle): int
    {
        $pos = strpos($raw, $needle);
        return $pos === false ? 1 : $this->lineOfOffset($raw, $pos);
    }

    private function lineOfOffset(string $raw, int $offset): int
    {
        return substr_count(substr($raw, 0, max(0, $offset)), "\n") + 1;
    }

    /**
     * @param list<array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string}> $findings
     * @return list<array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string}>
     */
    private function dedupeFindings(array $findings): array
    {
        $seen = [];
        $out = [];
        foreach ($findings as $f) {
            $key = $f['file'] . ':' . $f['line'] . ':' . $f['rule'] . ':' . $f['message'];
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $f;
        }
        return $out;
    }

    /** @return array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string} */
    private function finding(string $file, int $line, string $rule, string $severity, string $message, string $recommendation): array
    {
        return [
            'file' => $file,
            'line' => $line,
            'rule' => $rule,
            'severity' => $severity,
            'message' => $message,
            'recommendation' => $recommendation,
        ];
    }

    /** @return list<string> */
    private function forbiddenNamespaces(): array
    {
        /** @var list<string> $ns */
        $ns = $this->policy['forbidden_namespaces'] ?? [];
        return $ns;
    }

    /** @return list<string> */
    private function publicNamespaces(): array
    {
        /** @var list<string> $ns */
        $ns = $this->policy['public_namespaces'] ?? [];
        return $ns;
    }

    /** @return list<string> */
    private function forbiddenPatterns(): array
    {
        /** @var list<string> $p */
        $p = $this->policy['forbidden_php_patterns'] ?? [];
        return $p;
    }

    /** @return list<string> */
    private function frontendForbidden(): array
    {
        /** @var list<string> $p */
        $p = $this->policy['frontend_forbidden'] ?? [];
        return $p;
    }

    /** @return array<string, mixed> */
    private function defaultPolicy(): array
    {
        return [
            'public_namespaces' => ['App\\Platform\\', 'App\\PackageModules\\'],
            'forbidden_namespaces' => [
                'App\\Core\\', 'App\\Services\\', 'App\\Modules\\',
                'App\\Controllers\\', 'App\\Middleware\\', 'App\\Support\\',
            ],
            'forbidden_php_patterns' => ['Container::get', 'new Mailer'],
            'allowed_service_ids' => array_keys(ServiceRegistry::PUBLIC_CATALOG),
            'frontend_forbidden' => ["from '@/core/"],
        ];
    }
}
