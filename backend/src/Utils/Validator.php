<?php
declare(strict_types=1);
namespace App\Utils;
final class Validator {
    public static function check(array $data,array $rules): array { $errors=[]; foreach($rules as $key=>$rule) { $v=$data[$key]??null; foreach(explode('|',$rule) as $r) { [$n,$arg]=array_pad(explode(':',$r,2),2,null);
        $ok=match($n) {'required'=>$v!==null&&$v!=='','email'=>$v===null||filter_var($v,FILTER_VALIDATE_EMAIL),'url'=>$v===null||filter_var($v,FILTER_VALIDATE_URL),'min'=>$v===null||mb_strlen((string)$v)>=(int)$arg,'max'=>$v===null||mb_strlen((string)$v)<=(int)$arg,'enum'=>$v===null||in_array($v,explode(',',$arg),true),'slug'=>$v===null||preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/',(string)$v),default=>true}; if(!$ok) {$errors[$key][]=$n; break;}
    }} return $errors; }
}
