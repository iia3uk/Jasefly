<?php
declare(strict_types=1);

namespace App\PackageModules\Payments;

use App\Platform\Contracts\PlatformDatabaseInterface;

use App\Platform\Contracts\PlatformCatalogInterface;


/**
 * Unified purchasable catalog (services + products).
 */
final class CommerceCatalog
{
    public function __construct(private PlatformDatabaseInterface $db, private ?PlatformCatalogInterface $catalog = null)
    {
        $this->catalog ??= throw new \LogicException('Catalog facade is required');
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listPurchasable(): array
    {
        $items = [];
        foreach ($this->services() as $row) {
            $items[] = $this->normalize('service', $row);
        }
        foreach ($this->products() as $row) {
            $items[] = $this->normalize('product', $row);
        }
        usort($items, static fn(array $a, array $b) => ($a['sort_order'] ?? 0) <=> ($b['sort_order'] ?? 0));
        return $items;
    }

    /**
     * Peek item for checkout UI (even if temporarily out of stock).
     *
     * @return array<string, mixed>|null
     */
    public function peek(string $type, int $id): ?array
    {
        $type = strtolower(trim($type));
        if ($id < 1 || !in_array($type, ['service', 'product'], true)) {
            return null;
        }

        if ($type === 'service') {
            return $this->resolve('service', $id, null);
        }

        $row = $this->catalog->findProductById($id);
        if (!$row) {
            return null;
        }
        $item = $this->normalize('product', $row);
        $stock = $row['stock'] ?? null;
        $purchasable = (int) ($row['is_purchasable'] ?? 1) === 1;
        $inStock = $stock === null || (int) $stock > 0;
        $item['available'] = $purchasable && $inStock && (float) ($item['price'] ?? 0) > 0;
        $item['unavailable_reason'] = !$purchasable
            ? 'Товар нельзя купить'
            : (!$inStock ? 'Нет в наличии' : ((float) ($item['price'] ?? 0) <= 0 ? 'Не указана цена' : null));
        return $item;
    }

    /**
     * @return array{type:string,id:int,title:string,slug:string,price:float,currency:string,description:string,offer_text:?string,variant_index:?int,variant_label:?string}|null
     */
    public function resolve(string $type, int $id, ?int $variantIndex = null): ?array
    {
        $type = strtolower(trim($type));
        if ($id < 1 || !in_array($type, ['service', 'product'], true)) {
            return null;
        }
        if ($type === 'service') {
            $soft = new SoftDeleteService($this->db);
            $notDeleted = $soft->notDeletedClause('services');
            $row = $this->db->one(
                "SELECT * FROM services WHERE id=? AND is_visible=1 AND is_purchasable=1 AND deleted_at IS NULL",
                [$id],
            );
            return $row ? $this->normalize('service', $row) : null;
        }

        $row = $this->catalog->findProductById($id);
        if (!$row) {
            return null;
        }
        $stock = $row['stock'] ?? null;
        if ($stock !== null && (int) $stock < 1) {
            return null;
        }
        $item = $this->normalize('product', $row);
        if ($variantIndex !== null && $variantIndex >= 0) {
            $variants = $this->decodeVariants($row['variants'] ?? null);
            if (isset($variants[$variantIndex])) {
                $v = $variants[$variantIndex];
                $vPrice = round((float) ($v['price'] ?? 0), 2);
                if ($vPrice > 0) {
                    $item['price'] = $vPrice;
                    $label = trim((string) ($v['label'] ?? ''));
                    $item['title'] = $label !== ''
                        ? ((string) $item['title'] . ' — ' . $label)
                        : (string) $item['title'];
                    $item['variant_index'] = $variantIndex;
                    $item['variant_label'] = $label !== '' ? $label : null;
                }
            }
        }
        return $item;
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function decodeVariants(mixed $raw): array
    {
        if (is_array($raw)) {
            return array_values($raw);
        }
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? array_values($decoded) : [];
    }

    /** @return list<array<string,mixed>> */
    private function services(): array
    {
        try {
            $soft = new SoftDeleteService($this->db);
            $notDeleted = $soft->notDeletedClause('services');
            return $this->db->all(
                "SELECT * FROM services WHERE is_visible=1 AND is_purchasable=1 AND price IS NOT NULL AND price > 0 AND deleted_at IS NULL ORDER BY sort_order, id"
            );
        } catch (\Throwable) {
            return [];
        }
    }

    /** @return list<array<string,mixed>> */
    private function products(): array
    {
        return $this->catalog->listPurchasable();
    }

    /**
     * @param array<string,mixed> $row
     * @return array{type:string,id:int,title:string,slug:string,price:float,currency:string,description:string,offer_text:?string,duration_label:?string,sku:?string,media_id:?int,sort_order:int}
     */
    private function normalize(string $type, array $row): array
    {
        $price = (float) ($row['price'] ?? 0);
        $desc = trim((string) ($row['short_description'] ?? ''));
        if ($desc === '') {
            $desc = trim(strip_tags((string) ($row['description'] ?? '')));
        }
        $attrs = [];
        if (isset($row['attrs'])) {
            if (is_array($row['attrs'])) {
                $attrs = $row['attrs'];
            } elseif (is_string($row['attrs']) && $row['attrs'] !== '') {
                $decoded = json_decode($row['attrs'], true);
                $attrs = is_array($decoded) ? $decoded : [];
            }
        }
        $oldPrice = isset($attrs['old_price']) && is_numeric($attrs['old_price'])
            ? round((float) $attrs['old_price'], 2)
            : null;
        $variants = $type === 'product' ? $this->decodeVariants($row['variants'] ?? null) : [];

        return [
            'type' => $type,
            'id' => (int) $row['id'],
            'title' => (string) $row['title'],
            'slug' => (string) ($row['slug'] ?? ''),
            'price' => round($price, 2),
            'currency' => strtoupper((string) ($row['currency'] ?? 'RUB')),
            'description' => $desc,
            'offer_text' => isset($row['offer_text']) && $row['offer_text'] !== null && $row['offer_text'] !== ''
                ? (string) $row['offer_text']
                : null,
            'duration_label' => isset($row['duration_label']) ? (string) $row['duration_label'] : null,
            'sku' => isset($row['sku']) ? (string) $row['sku'] : null,
            'media_id' => isset($row['media_id']) && $row['media_id'] !== '' && $row['media_id'] !== null
                ? (int) $row['media_id']
                : null,
            'badge' => isset($row['badge']) && $row['badge'] !== '' ? (string) $row['badge'] : null,
            'old_price' => $oldPrice,
            'variants' => array_map(static function (array $v): array {
                return [
                    'label' => (string) ($v['label'] ?? ''),
                    'price' => isset($v['price']) ? round((float) $v['price'], 2) : null,
                    'old_price' => isset($v['old_price']) ? round((float) $v['old_price'], 2) : null,
                    'discount_label' => isset($v['discount_label']) ? (string) $v['discount_label'] : null,
                    'highlight' => isset($v['highlight']) ? (string) $v['highlight'] : null,
                ];
            }, $variants),
            'sort_order' => (int) ($row['sort_order'] ?? 0),
            'price_label' => isset($row['price_label']) ? (string) $row['price_label'] : null,
        ];
    }
}
