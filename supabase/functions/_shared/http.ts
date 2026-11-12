export const cors={
 'access-control-allow-origin':'*',
 'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
 'access-control-allow-methods':'GET,POST,OPTIONS',
};
export function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
export function message(error:unknown){return error instanceof Error?error.message:'Beklenmeyen sunucu hatası.'}
