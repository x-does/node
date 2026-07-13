import mysql from 'mysql2/promise';
export const MAX_DB_INT=2147483647;

const enabled=value=>/^(1|true|yes|required)$/i.test(value??'');
const port=value=>{const parsed=Number(value??3306);if(!Number.isSafeInteger(parsed)||parsed<1||parsed>65535)throw new Error('database port must be an integer between 1 and 65535');return parsed;};
export function databaseConfig(env=process.env){
 const ssl=enabled(env.DB_SSL)?{rejectUnauthorized:true,...(env.DB_SSL_CA?{ca:env.DB_SSL_CA}:{}),...(env.DB_SSL_CERT?{cert:env.DB_SSL_CERT}:{}),...(env.DB_SSL_KEY?{key:env.DB_SSL_KEY}:{})}:undefined;
 if(env.DATABASE_URL){
  const url=new URL(env.DATABASE_URL),params=url.searchParams;
  const sslMode=(params.get('ssl-mode')??params.get('sslmode')??'').toUpperCase();
  if(['DISABLED','PREFERRED'].includes(sslMode))throw new Error('DATABASE_URL TLS cannot be disabled');
  if(/^(false|0|no)$/i.test(params.get('rejectUnauthorized')??''))throw new Error('DATABASE_URL TLS verification cannot be disabled');
  if(/^(false|0|no|disabled)$/i.test(params.get('ssl')??''))throw new Error('DATABASE_URL TLS cannot be disabled');
  const urlSsl=Boolean(sslMode)||enabled(params.get('ssl'))||params.has('ssl-ca')||params.has('ssl-cert')||params.has('ssl-key');
  const tls=urlSsl?{rejectUnauthorized:true,...(params.get('ssl-ca')?{ca:params.get('ssl-ca')}:{}),...(params.get('ssl-cert')?{cert:params.get('ssl-cert')}:{}),...(params.get('ssl-key')?{key:params.get('ssl-key')}:{})}:ssl;
  const config={host:url.hostname,port:port(url.port||3306),database:decodeURIComponent(url.pathname.replace(/^\//,'')),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),...(tls?{ssl:tls}:{})};
  for(const key of ['charset','timezone','socketPath'])if(params.has(key))config[key]=params.get(key);
  for(const key of ['connectTimeout','connectionLimit','queueLimit'])if(params.has(key)){const value=Number(params.get(key));if(!Number.isSafeInteger(value)||value<0)throw new Error(`${key} must be a non-negative integer`);config[key]=value;}
  return config;
 }
 return{host:env.DB_HOST,port:port(env.DB_PORT),database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASSWORD,...(ssl?{ssl}:{})};
}
export class MysqlAdapter{
 constructor(pool=mysql.createPool(databaseConfig())){this.pool=pool;}
 async ready(){try{await this.pool.query('SELECT 1');return true;}catch{return false;}}
 async loadRoom(code,connection=this.pool){const[[room]]=await connection.query('SELECT * FROM openclaw_dnp_rooms WHERE code=?',[code]);if(!room)return null;const[players]=await connection.query('SELECT * FROM openclaw_dnp_players WHERE room_id=? ORDER BY join_order',[room.id]);return map(room,players);}
 async refresh(code){return this.loadRoom(code);}
 async checkpoint(state,expectedVersion,players=state.players){const connection=await this.pool.getConnection();try{await connection.beginTransaction();const[result]=await connection.execute('UPDATE openclaw_dnp_rooms SET score_left=?,score_right=?,ball_x=?,ball_y=?,ball_vx=?,ball_vy=?,last_tick_at=NOW(3),version=version+1 WHERE id=? AND version=?',[state.scoreLeft,state.scoreRight,state.ballX,state.ballY,state.ballVx,state.ballVy,state.id,expectedVersion]);if(result.affectedRows!==1){const error=new Error('room checkpoint conflicted');error.code='DNP_CONFLICT';throw error;}const playerSeqs={};for(const p of players){const seq=Math.max(0,Math.min(MAX_DB_INT,p.inputSeq));const[updated]=await connection.execute('UPDATE openclaw_dnp_players SET input_position=?,input_seq=?,last_seen_at=NOW(3) WHERE id=? AND left_at IS NULL AND input_seq < ?',[p.inputPosition,seq,p.id,seq]);if(updated.affectedRows)playerSeqs[p.id]=seq;}await connection.commit();return{version:expectedVersion+1,playerSeqs};}catch(error){await connection.rollback();throw error;}finally{connection.release();}}
 async touchPresence(playerIds){if(!playerIds.length)return;const placeholders=playerIds.map(()=>'?').join(',');await this.pool.execute(`UPDATE openclaw_dnp_players SET last_seen_at=NOW(3) WHERE left_at IS NULL AND id IN (${placeholders})`,playerIds);}
 async close(){await this.pool.end();}
}
function map(r,ps){return{id:r.id,code:r.code,mode:r.mode,status:r.status,adminPlayerId:r.admin_player_id,scoreLeft:r.score_left,scoreRight:r.score_right,ballX:r.ball_x,ballY:r.ball_y,ballVx:r.ball_vx,ballVy:r.ball_vy,version:r.version,lastTickAt:new Date(r.last_tick_at),players:ps.map(p=>({id:p.id,roomId:p.room_id,name:p.name,joinOrder:p.join_order,slotIndex:p.slot_index,inputPosition:p.input_position,inputSeq:p.input_seq,lastSeenAt:new Date(p.last_seen_at),leftAt:p.left_at?new Date(p.left_at):null}))};}
