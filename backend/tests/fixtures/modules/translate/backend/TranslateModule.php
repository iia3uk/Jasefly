<?php
declare(strict_types=1);

namespace App\PackageModules\Translate;

use App\Platform\Contracts\PlatformContentInterface;
use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class TranslateModule extends AbstractPackageModule
{
    private PlatformDatabaseInterface $db;
    private PlatformContentInterface $content;
    /** @var array<string, mixed> */
    private array $settings = [];

    public function name(): string { return 'translate'; }
    public function label(): string { return 'Переводчик сайта'; }
    public function priority(): int { return 55; }
    public function adminNav(): array { return [['group'=>'Сайт','path'=>'/admin/translate','label'=>'Переводчик','permission'=>'settings.manage','icon'=>'globe']]; }
    public function settingsSchema(): array { return [['key'=>'widget_enabled','label'=>'Показывать виджет на сайте','type'=>'checkbox','default'=>true],['key'=>'sync_on_save','label'=>'Переводить при сохранении','type'=>'checkbox','default'=>true],['key'=>'auto_warmup','label'=>'Автопрогрев кэша','type'=>'checkbox','default'=>true],['key'=>'geo_auto_lang','label'=>'Авто-язык по стране','type'=>'checkbox','default'=>true],['key'=>'source_lang','label'=>'Исходный язык','type'=>'text','default'=>'ru'],['key'=>'languages','label'=>'Языки','type'=>'text','default'=>'en,de,fr,es'],['key'=>'position','label'=>'Позиция','type'=>'text','default'=>'bottom-right'],['key'=>'provider','label'=>'Движок перевода','type'=>'text','default'=>'google'],['key'=>'rate_limit','label'=>'Лимит запросов / мин','type'=>'number','default'=>60],['key'=>'content_hash','label'=>'Хеш контента','type'=>'text','default'=>''],['key'=>'cache_ready','label'=>'Кэш готов','type'=>'checkbox','default'=>false]]; }
    public function settings(): array { $out=[]; foreach($this->settingsSchema() as $field){$out[$field['key']]=$field['default']??'';} return $out; }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);
        foreach (['api.routes','admin.pages','permissions.check'] as $cap) { $ctx->capabilities()->require($cap); }
        $this->db=$ctx->database(); $this->content=$ctx->content(); $this->settings=$this->settingsFromDb();
        try { (new TranslateCache($this->db))->ensureTable(); } catch (\Throwable) {}
        $ctx->events()->subscribe('resource.afterSave', function(array $payload): void { $this->onContentSaved($payload); });
        $ctx->events()->subscribe('page.afterPublish', function(array $payload): void { $this->persistReadyState('', false); });
        $http=$ctx->http(); $protected=[$http->authMiddleware(),$http->permissionMiddleware()];
        $public=$http->softRateLimitMiddleware(max(30,min(180,(int)($this->settings['rate_limit']??60)*2)),60,['throttled'=>true,'data'=>['translations'=>[]]]);
        $warmup=$http->softRateLimitMiddleware(12,60,['throttled'=>true,'data'=>['enabled'=>true,'finished'=>false,'translated'=>0]]);
        $http->post('/translate/batch', fn(PlatformRequestInterface $r)=>$this->batch($r), [$public]);
        $http->post('/translate/auto-warmup', fn(PlatformRequestInterface $r)=>$this->warmup($r), [$warmup]);
        $http->get('/admin/translate/status', fn()=>PlatformResponse::json(['data'=>$this->status()]), $protected);
        $http->post('/admin/translate/warmup', fn(PlatformRequestInterface $r)=>$this->warmup($r), $protected);
        $http->post('/admin/translate/purge-invalid', function(): void { $deleted=(new TranslateCache($this->db))->purgeInvalid(); $this->persistReadyState('',false); PlatformResponse::json(['data'=>array_merge($this->status(),['purged'=>$deleted])]); }, $protected);
    }

    private function batch(PlatformRequestInterface $r): void
    {
        if (!($this->settings['widget_enabled']??true)) { PlatformResponse::error('Translate widget disabled',403); }
        $source=strtolower(trim((string)$r->input('source',$this->settings['source_lang']??'ru'))); $target=strtolower(trim((string)$r->input('target','')));
        if ($target==='' || !in_array($target,$this->targets(),true)) { PlatformResponse::error('Unsupported target language',422); }
        $texts=[]; foreach((array)$r->input('texts',[]) as $text){if(is_string($text)&&($text=trim($text))!==''&&mb_strlen($text)<=2000)$texts[]=$text;if(count($texts)>=200)break;}
        PlatformResponse::json(['data'=>(new TranslateService($this->settings,$this->db))->translateBatch($texts,$source,$target,true,(bool)$r->input('fill_misses',false)?12:0)]);
    }

    private function warmup(PlatformRequestInterface $r): void
    {
        if (!($this->settings['widget_enabled']??true)||!($this->settings['auto_warmup']??true)) { PlatformResponse::json(['data'=>['enabled'=>false,'finished'=>true,'translated'=>0]]); }
        $status=$this->status(); if (($status['ready']??false)||$r->input('check_only',false)) { PlatformResponse::json(['data'=>array_merge($status,['enabled'=>true,'finished'=>$status['ready'],'translated'=>0])]); }
        $source=(string)($this->settings['source_lang']??'ru'); $target=$this->targets()[0]??'en'; $corpus=$this->content->collectHumanReadableStrings(2500); $cache=new TranslateCache($this->db); $cached=$cache->getMany($source,$target,$corpus); $missing=[]; foreach($corpus as $text){if(!isset($cached[TranslateCache::hash($text)])){$missing[]=$text;if(count($missing)>=max(3,min(12,(int)$r->input('batch_size',6))))break;}}
        $result=(new TranslateService($this->settings,$this->db))->translateBatch($missing,$source,$target,false); $status=$this->status(); if($status['ready'])$this->persistReadyState((string)$status['content_hash'],true); PlatformResponse::json(['data'=>array_merge($status,['enabled'=>true,'translated'=>(int)($result['fetched']??0),'failed'=>(int)($result['failed']??0),'target'=>$target])]);
    }

    /** @param array<string,mixed> $payload */
    private function onContentSaved(array $payload): void
    {
        $resource=(string)($payload['table']??$payload['resource']??''); if(!$this->content->isContentResource($resource)||!($this->settings['sync_on_save']??true)||!is_array($payload['data']??null))return;
        $result=(new TranslateSync($this->db,$this->settings))->syncPayload($payload['data'],36); if(($result['fetched']??0)>0||($result['failed']??0)>0)$this->persistReadyState('',false);
    }

    /** @return array<string,mixed> */
    private function status(): array { $source=(string)($this->settings['source_lang']??'ru');$corpus=$this->content->collectHumanReadableStrings(2500);$cache=new TranslateCache($this->db);$missing=[];$ready=true;foreach($this->targets() as $target){$missing[$target]=$cache->missingCount($source,$target,$corpus);if($missing[$target]>0)$ready=false;}return ['ready'=>$ready,'finished'=>$ready,'content_hash'=>hash('sha256',implode("\0",$corpus).'|'.implode(',',$this->targets())),'corpus_size'=>count($corpus),'missing'=>$missing,'missing_total'=>array_sum($missing),'cache'=>$cache->stats()]; }
    /** @return list<string> */
    private function targets(): array { $source=strtolower(trim((string)($this->settings['source_lang']??'ru')));$out=[];foreach(preg_split('/[\s,;]+/',strtolower((string)($this->settings['languages']??'en,de,fr,es')))?:[] as $target){$target=preg_replace('/[^a-z-]/','',$target)??'';if($target!==''&&$target!==$source&&!in_array($target,$out,true))$out[]=$target;}return $out?:['en']; }
    private function persistReadyState(string $hash,bool $ready): void { $this->settings['content_hash']=$hash;$this->settings['cache_ready']=$ready;try{$this->db->run('UPDATE modules SET settings=? WHERE name=?',[json_encode($this->settings,JSON_UNESCAPED_UNICODE),'translate']);}catch(\Throwable){} }
    /** @return array<string,mixed> */
    private function settingsFromDb(): array {try{$row=$this->db->one('SELECT settings FROM modules WHERE name=?',['translate']);$saved=json_decode((string)($row['settings']??''),true);return is_array($saved)?array_replace($this->settings(),$saved):$this->settings();}catch(\Throwable){return $this->settings();}}
}