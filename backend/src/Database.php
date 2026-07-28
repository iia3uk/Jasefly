<?php
declare(strict_types=1);
namespace App;
use PDO;
use App\Core\Db\Dialect;
use App\Core\Db\MysqlDialect;
use App\Core\Db\PgDialect;
use App\Core\Db\SchemaInspector;
use App\Core\Db\SchemaInspectorFactory;
use App\Core\Db\SqliteDialect;

final class Database {
    private static ?self $instance = null;
    private PDO $pdo;
    private string $driver;
    private Dialect $dialect;
    private SchemaInspector $inspector;

    private function __construct(array $c) {
        $this->driver = strtolower((string) ($c['driver'] ?? 'mysql'));

        $this->pdo = match ($this->driver) {
            'sqlite' => $this->makeSqlite($c),
            'pgsql' => $this->makePgsql($c),
            default => $this->makeMysql($c),
        };

        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

        $this->dialect = match ($this->driver) {
            'sqlite' => new SqliteDialect(),
            'pgsql' => new PgDialect(),
            default => new MysqlDialect(),
        };
        $this->inspector = SchemaInspectorFactory::make($this->driver, $this);

        // SQLite: enable FK enforcement by default per connection.
        if ($this->driver === 'sqlite') {
            $this->pdo->exec('PRAGMA foreign_keys = ON');
        }
    }

    private function makeMysql(array $c): PDO {
        if (!$c['name'] || !$c['user']) {
            throw new \RuntimeException('Database is not configured. Run install.php.');
        }
        $dsn = "mysql:host={$c['host']};dbname={$c['name']};charset={$c['charset']}";
        $port = (string) ($c['port'] ?? '');
        if ($port !== '' && $port !== '3306') {
            $dsn .= ";port={$port}";
        }
        return new PDO($dsn, $c['user'], (string) ($c['pass'] ?? ''));
    }

    private function makeSqlite(array $c): PDO {
        $path = (string) ($c['path'] ?? '');
        if ($path === '') {
            throw new \RuntimeException('SQLite path not configured. Run install.php.');
        }
        // Resolve relative paths against the backend root (so "storage/sqlite/cms.sqlite"
        // and absolute paths both work; avoids accidental storage/storage/ doubling).
        if (!preg_match('#^([A-Za-z]:[\\/]|[\\/])#', $path) && strpos($path, ':') === false) {
            $path = dirname(__DIR__) . '/' . ltrim($path, '/');
        }
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return new PDO('sqlite:' . $path);
    }

    private function makePgsql(array $c): PDO {
        if (!$c['name'] || !$c['user']) {
            throw new \RuntimeException('Database is not configured. Run install.php.');
        }
        $dsn = "pgsql:host={$c['host']};dbname={$c['name']}";
        $port = (string) ($c['port'] ?? '');
        if ($port !== '' && $port !== '5432') {
            $dsn .= ";port={$port}";
        }
        return new PDO($dsn, $c['user'], (string) ($c['pass'] ?? ''));
    }

    public static function get(array $config): self { return self::$instance ??= new self($config); }

    public function pdo(): PDO { return $this->pdo; }
    public function driver(): string { return $this->driver; }
    public function dialect(): Dialect { return $this->dialect; }
    public function inspector(): SchemaInspector { return $this->inspector; }

    public function run(string $sql, array $params = []): \PDOStatement { $s=$this->pdo->prepare($sql); $s->execute($params); return $s; }
    public function one(string $sql, array $params = []): ?array { return $this->run($sql,$params)->fetch() ?: null; }
    public function all(string $sql, array $params = []): array { return $this->run($sql,$params)->fetchAll(); }
    public function id(): int { return (int)$this->pdo->lastInsertId(); }

    /**
     * Run $fn inside a PDO transaction. Nested calls reuse the outer transaction
     * (no savepoints — shared hosting PDO may lack them).
     *
     * @template T
     * @param callable():T $fn
     * @return T
     */
    public function transaction(callable $fn): mixed
    {
        $started = false;
        if (!$this->pdo->inTransaction()) {
            $this->pdo->beginTransaction();
            $started = true;
        }
        try {
            $result = $fn();
            if ($started) {
                $this->pdo->commit();
            }
            return $result;
        } catch (\Throwable $e) {
            if ($started && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Driver-aware upsert. Inserts $data; on conflict over $uniqueCols, updates
     * the columns listed in $updateCols (defaults to all $data keys).
     *
     * @param array<string, mixed> $data
     * @param list<string> $uniqueCols
     * @param list<string>|null $updateCols
     */
    public function upsert(string $table, array $data, array $uniqueCols, ?array $updateCols = null): void {
        $updateCols ??= array_keys($data);
        $cols = array_keys($data);
        $q = $this->dialect;
        $quoted = array_map([$q, 'quoteIdent'], $cols);
        $placeholders = array_map(fn(int $i) => ':v' . $i, range(0, count($cols) - 1));
        $sql = 'INSERT INTO ' . $q->quoteIdent($table)
            . ' (' . implode(', ', $quoted) . ') VALUES (' . implode(', ', $placeholders) . ')'
            . $q->upsertConflictClause($uniqueCols, $updateCols);
        $params = [];
        foreach (array_values($data) as $i => $v) {
            $params[':v' . $i] = $v;
        }
        $this->run($sql, $params);
    }
}
