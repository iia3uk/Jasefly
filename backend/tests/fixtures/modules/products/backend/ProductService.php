<?php
declare(strict_types=1);

namespace App\PackageModules\Products;

use App\Platform\Contracts\PlatformDatabaseInterface;

final class ProductService
{
    private const WRITABLE = ['title','slug','sku','short_description','description','price','currency','media_id','stock','is_purchasable','is_visible','sort_order','badge','sold_count','video_url','attrs','variants','gallery','tabs','tags'];
    public function __construct(private PlatformDatabaseInterface $db) {}
    /** @return list<array<string,mixed>> */
    public function list(): array { return $this->db->all('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY sort_order, id DESC'); }
    /** @return array<string,mixed>|null */
    public function get(int $id): ?array { return $this->db->one('SELECT * FROM products WHERE id=? AND deleted_at IS NULL', [$id]); }
    /** @param array<string,mixed> $input @return array<string,mixed> */
    public function create(array $input): array { $values=$this->writable($input); if (!$values) throw new \InvalidArgumentException('No writable fields'); $this->validate($values); $this->uniqueSlug((string)($values['slug'] ?? '')); $cols=array_keys($values); $this->db->run('INSERT INTO products (`'.implode('`,`',$cols).'`) VALUES ('.implode(',',array_fill(0,count($cols),'?')).')',array_values($values)); return $this->get($this->db->lastInsertId()) ?? throw new \RuntimeException('Product was not created'); }
    /** @param array<string,mixed> $input @return array<string,mixed> */
    public function update(int $id, array $input): array { if (!$this->get($id)) throw new \OutOfBoundsException('Not found'); $values=$this->writable($input); if (isset($values['slug'])) $this->uniqueSlug((string)$values['slug'],$id); $this->validate($values,false); if ($values) { $sets=implode(',',array_map(static fn(string $c)=>"`$c`=?",array_keys($values))); $this->db->run("UPDATE products SET $sets WHERE id=?",[...array_values($values),$id]); } return $this->get($id) ?? throw new \OutOfBoundsException('Not found'); }
    public function delete(int $id): void { if (!$this->get($id)) throw new \OutOfBoundsException('Not found'); $this->db->run('UPDATE products SET deleted_at=CURRENT_TIMESTAMP WHERE id=?',[ $id ]); }
    /** @param array<string,mixed> $input @return array<string,mixed> */
    private function writable(array $input): array { $out=[]; foreach(self::WRITABLE as $key){ if(!array_key_exists($key,$input)) continue; $value=$input[$key]; $out[$key]=is_array($value)||is_object($value)?json_encode($value,JSON_UNESCAPED_UNICODE):$value; } if(isset($out['title'])&&!isset($out['slug'])) $out['slug']=$this->slug((string)$out['title']); if(isset($out['slug'])) $out['slug']=$this->slug((string)$out['slug']); return $out; }
    /** @param array<string,mixed> $values */
    private function validate(array $values, bool $creating=true): void { if($creating && trim((string)($values['title']??''))==='') throw new \InvalidArgumentException('Название обязательно'); if(isset($values['price']) && (!is_numeric($values['price']) || (float)$values['price']<0)) throw new \InvalidArgumentException('Некорректная цена'); }
    private function slug(string $value): string { $value=mb_strtolower(trim($value)); $value=preg_replace('/[^a-z0-9а-яё]+/u','-',$value) ?? ''; $value=trim($value,'-'); return $value!==''?$value:'product'; }
    private function uniqueSlug(string $slug, ?int $except=null): void { $row=$this->db->one('SELECT id FROM products WHERE slug=? AND deleted_at IS NULL'.($except?' AND id<>?':''),$except?[$slug,$except]:[$slug]); if($row) throw new \InvalidArgumentException('Slug уже используется'); }
}