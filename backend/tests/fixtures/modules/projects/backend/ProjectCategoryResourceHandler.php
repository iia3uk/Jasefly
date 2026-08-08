<?php
declare(strict_types=1);

namespace App\PackageModules\Projects;

use App\Platform\Contracts\ContentResourceHandler;
use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Utils\Str;

final class ProjectCategoryResourceHandler implements ContentResourceHandler
{
    public function __construct(private PlatformDatabaseInterface $db) {}
    public function list(array $query): array { return ['items' => $this->db->all('SELECT * FROM project_categories WHERE deleted_at IS NULL ORDER BY name,id')]; }
    public function get(int|string $id, array $opts = []): ?array { return $this->db->one(is_numeric($id) ? 'SELECT * FROM project_categories WHERE id=? AND deleted_at IS NULL' : 'SELECT * FROM project_categories WHERE slug=? AND deleted_at IS NULL', [$id]); }
    public function create(array $data, ?array $user): array { $v = $this->values($data); if ($v === []) return ['ok'=>false,'code'=>'validation','error'=>'No writable fields']; $this->db->run('INSERT INTO project_categories (`'.implode('`,`', array_keys($v)).'`) VALUES ('.implode(',', array_fill(0,count($v),'?')).')', array_values($v)); return ['ok'=>true,'data'=>$this->get($this->db->lastInsertId())]; }
    public function update(int|string $id, array $data, ?array $user): array { if (!$this->get($id)) return ['ok'=>false,'code'=>'not_found','error'=>'Not found']; $v=$this->values($data); if ($v !== []) $this->db->run('UPDATE project_categories SET '.implode(',',array_map(static fn($k)=>"`{$k}`=?",array_keys($v))).' WHERE id=?', [...array_values($v),(int)$id]); return ['ok'=>true,'data'=>$this->get($id)]; }
    public function delete(int|string $id, ?array $user): array { $this->db->run('UPDATE project_categories SET deleted_at=NOW() WHERE id=?', [(int)$id]); return ['ok'=>true,'data'=>['id'=>(int)$id,'mode'=>'trash']]; }
    public function publish(int|string $id, string $status, ?array $user): array { return ['ok'=>false,'code'=>'validation','error'=>'Categories cannot be published']; }
    public function relations(int|string $id, string $relation): array { return []; }
    public function replaceRelations(int|string $id, string $relation, array $rows, ?array $user): array { return ['ok'=>false,'code'=>'unknown_relation','error'=>'Unknown relation']; }
    public function publicList(array $query): array { return ['items'=>[]]; }
    public function publicGet(string $slug): ?array { return null; }
    private function values(array $data): array { $out=[]; foreach(['name','slug','description','sort_order'] as $k) if(array_key_exists($k,$data)) $out[$k]=$data[$k]; if(isset($out['name'])&&empty($out['slug']))$out['slug']=Str::slug((string)$out['name']); if(isset($out['slug']))$out['slug']=Str::slug((string)$out['slug']); return $out; }
}