// Data e hora vem do SQLite, sempre. Nada de new Date() espalhado pelo codigo:
// um relogio so evita que o servidor em UTC e a fabrica em -03 gravem dias
// diferentes na mesma linha.
const db=require('./db');

const pAgora=db.prepare("SELECT datetime('now','localtime') v");
const pHoje =db.prepare("SELECT date('now','localtime') v");

const agora=()=>pAgora.get().v;   // '2026-08-28 14:03:11'
const hoje =()=>pHoje.get().v;    // '2026-08-28'

module.exports={agora,hoje};
