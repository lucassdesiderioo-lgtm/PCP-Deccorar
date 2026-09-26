/* A FOTO QUE É PROVA — dono único de "isto é uma foto aceitável?".
 *
 * Usada pelo fechamento antigo da coleta (só leitura, hoje) e pela saída do
 * caminhão (spec SAIDA-E-DUPLA-CONFERENCIA, fase 3). A foto chega como data URL
 * (a tela já reduziu para ~1600 px em JPEG). Aqui só se confere que É imagem e
 * que tem conteúdo — foto vazia não é prova. Duas cópias desta régua aceitariam
 * numa tela a foto que a outra recusa.
 */
function decodificarFoto(s){
  const m = String(s||'').match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if(!m) return null;
  const buf = Buffer.from(m[2].replace(/\s+/g,''), 'base64');
  if(buf.length < 2000) return null;
  return { ext:(m[1].toLowerCase()==='jpg' ? 'jpeg' : m[1].toLowerCase()), buf };
}
function tipoDaFoto(arq){
  return /\.png$/i.test(arq) ? 'image/png' : (/\.webp$/i.test(arq) ? 'image/webp' : 'image/jpeg');
}
module.exports = { decodificarFoto, tipoDaFoto };
