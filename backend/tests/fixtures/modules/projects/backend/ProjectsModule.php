<?php
declare(strict_types=1);

namespace App\PackageModules\Projects;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class ProjectsModule extends AbstractPackageModule
{
    public function name(): string { return 'projects'; }
    public function label(): string { return 'Проекты'; }
    public function priority(): int { return 30; }
    public function registersRoutesWhenDisabled(): bool { return true; }
    public function adminNav(): array { return [['group'=>'Контент','path'=>'/admin/projects','label'=>'Проекты','permission'=>'content.view','icon'=>'folder']]; }
    public function blocks(): array { return [['type'=>'projects-grid','label'=>'Сетка проектов','category'=>'content']]; }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);
        foreach (['api.routes','admin.pages','permissions.check','builder.widgets'] as $cap) $ctx->capabilities()->require($cap);
        $ctx->resources()->register('projects', ['table'=>'projects','public'=>true,'relations'=>['technologies','features','timeline','tags','media']], new ProjectResourceHandler($ctx->database()));
        $ctx->resources()->register('project-categories', ['table'=>'project_categories','public'=>false], new ProjectCategoryResourceHandler($ctx->database()));
        $http=$ctx->http(); $resources=$ctx->resources(); $perms=$ctx->permissions(); $protected=[$http->authMiddleware(),$http->permissionMiddleware()];
        $http->get('/projects', static function(PlatformRequestInterface $r) use($resources):void {
            if (!$resources->has('projects')) { PlatformResponse::json(['data'=>[]]); }
            PlatformResponse::json(['data'=>$resources->publicList('projects',$r->query())['items']??[]]);
        });
        $http->get('/projects/{slug}', static function(PlatformRequestInterface $r, string $slug) use($resources):void {
            if (!$resources->has('projects')) { PlatformResponse::error('Not found',404); }
            $item=$resources->publicGet('projects',$slug);
            $item ? PlatformResponse::json(['data'=>$item]) : PlatformResponse::error('Not found',404);
        });
        foreach (['projects','project-categories'] as $type) {
            $path='/admin/'.$type;
            $http->get($path, static function(PlatformRequestInterface $r) use($resources,$perms,$type):void { self::gate($resources,$type,false); $perms->require($r->user()??[],'content.view'); PlatformResponse::json(['data'=>$resources->list($type,$r->query())['items']??[]]); },$protected);
            $http->post($path, static function(PlatformRequestInterface $r) use($resources,$perms,$type):void { self::gate($resources,$type,false); $perms->require($r->user()??[],'content.edit'); self::respond($resources->create($type,$r->body(),$r->user()),201); },$protected);
            $http->get($path.'/{id}', static function(PlatformRequestInterface $r,string $id) use($resources,$perms,$type):void { self::gate($resources,$type,true); $perms->require($r->user()??[],'content.view'); $item=$resources->get($type,$id); $item ? PlatformResponse::json(['data'=>$item]) : PlatformResponse::error('Not found',404); },$protected);
            $http->put($path.'/{id}', static function(PlatformRequestInterface $r,string $id) use($resources,$perms,$type):void { self::gate($resources,$type,true); $perms->require($r->user()??[],'content.edit'); self::respond($resources->update($type,$id,$r->body(),$r->user())); },$protected);
            $http->delete($path.'/{id}', static function(PlatformRequestInterface $r,string $id) use($resources,$perms,$type):void { self::gate($resources,$type,true); $perms->require($r->user()??[],'content.delete'); self::respond($resources->delete($type,$id,$r->user())); },$protected);
        }
        $http->post('/admin/projects/{id}/publish', static function(PlatformRequestInterface $r,string $id) use($resources,$perms):void { self::gate($resources,'projects',true); $perms->require($r->user()??[],'content.edit'); self::respond($resources->publish('projects',$id,(string)($r->body()['status']??'published'),$r->user())); },$protected);
    }
    private static function gate(object $resources,string $type,bool $item):void { if (!$resources->has($type)) { $item ? PlatformResponse::error('Not found',404) : PlatformResponse::json(['data'=>[]]); } }
    private static function respond(array $result,int $okStatus=200):void { if($result['ok']??false) PlatformResponse::json(['data'=>$result['data']??null],$okStatus); $status=($result['code']??'')==='not_found'?404:(($result['code']??'')==='validation'?422:409); PlatformResponse::error((string)($result['error']??'Request failed'),$status); }
}