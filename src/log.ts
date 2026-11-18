export function log(event:string, fields:Record<string,unknown>={}) { console.log(JSON.stringify({time:new Date().toISOString(),event,...fields})); }
// Error payloads from SDKs can contain request data; logs use categories only.
export function failure(event:string) { log(event,{status:'failed'}); }
