> **STATUS · 17/09/2026 — PLANEJADO**
> Nada das camadas 2 e 3 está no código: sem `app.webmanifest`, sem meta tags de app,
> sem `bipe.js` único, sem fila offline (`evento_recebido`), sem service worker.
> A camada 1 (ajustes do iPad) não aparece no código — conferir nos tablets.
> Movido do Projeto "PCP - Deccorar" para o repositório em 17/09/2026.

---

# Tablets e Kiosk — a estação de trabalho no iPad

> Por que **não** fazer um app nativo, e o que fazer no lugar.
> **Versão 1 · 03/09/2026** — decisão tomada a partir dos quatro sintomas relatados
> na bancada: operador sai da tela, leitor falha, tela apaga/recarrega, Wi-Fi cai e
> perde bipe.
> **Leia junto com:** `ARQUITETURA-ALVO.md` §8 e §9 · `DESIGN.md` · `CLAUDE.md`
> **Status:** plano de execução — camadas 1 e 2 podem ir hoje

---

## 1. A decisão em uma frase

**Não se faz app nativo.** Dos quatro sintomas, três são configuração do iPad e bug
de front-end nosso — um app nativo não conserta nenhum deles — e o quarto (perder
bipe com Wi-Fi caindo) se resolve com fila local, que roda igual dentro do Safari.

O que se faz é transformar o site em **app instalado na tela de início + iPad
trancado numa tela só**, e fechar a fila offline que já está no plano como dívida #3.

---

## 2. Por que o app nativo é a resposta errada

O sistema é HTML sem framework servido por Node/Express. Um "app para iPad" seria,
na prática, um `WKWebView` carregando exatamente essas mesmas telas. Os defeitos
viajam junto:

| O que o app nativo herdaria | Onde está hoje |
|---|---|
| 5 implementações do bipe, 3 dialetos incompatíveis | `ARQUITETURA-ALVO.md` §8 |
| Campo de bipe escondido a `-9999px` em 2 telas | `montagem.html`, `carregamento.html` |
| 17 de 32 chamadas de rede sem tratamento de erro | revisão §4 |
| 10 paletas divergentes, piso de 15px violado | `DESIGN.md` |

E cobra por cima:

| Custo | Detalhe |
|---|---|
| US$ 99/ano | Conta Apple Developer, obrigatória para instalar em device |
| Distribuição | TestFlight expira a cada 90 dias; distribuição interna de verdade exige Apple Business Manager (DUNS, verificação) |
| Ciclo de ajuste | Cada mudança de tela vira build no Xcode + reinstalação em todos os tablets, em vez de `git push` |
| Mac na cadeia | Sem Mac ligado, ninguém publica correção — hoje qualquer correção sai do servidor |

**E não resolve o sintoma nº 1.** Num app nativo o operador continua podendo deslizar
para sair e abrir o WhatsApp. Quem impede isso é o iPadOS, não o formato do app.

---

## 3. O que resolve cada sintoma

| Sintoma | Causa real | Conserto | Camada |
|---|---|---|---|
| Operador sai da tela | iPad sem trava | Tela de Início (sem barra do Safari) + Acesso Guiado | 1 e 2 |
| Tela apaga no meio do turno | `Bloqueio Automático` padrão | Ajuste do iPad + carregador fixo | 1 |
| Recarrega e perde o estado | Safari descarta aba em segundo plano | Modo standalone (tela de início) | 2 |
| Leitor perde o foco / abre teclado | Campo a `-9999px`, foco não recuperado | `bipe.js` único (§8 da arquitetura) | 3 |
| Som do bipe não toca | iOS bloqueia áudio sem gesto do usuário | Desbloqueio do áudio no primeiro toque do turno | 3 |
| Wi-Fi cai e o bipe some | Sem fila, sem confirmação | Fila local com chave de idempotência | 3 |
| Lentidão | Possivelmente saindo para a internet | Servidor na rede local | 4 |

---

## 4. Camada 1 — trancar o iPad (hoje, zero código)

Em cada tablet, nesta ordem:

**4.1 · Não deixar a tela apagar**
`Ajustes → Tela e Brilho → Bloqueio Automático → Nunca`
Tablet sempre no carregador. A Wake Lock API não existe no Safari do iPad — não
adianta tentar resolver por código.

**4.2 · Tirar o que distrai**
`Ajustes → Notificações` — desligar tudo, ou ativar `Não Perturbe` permanente.
`Ajustes → Face ID e Código` — desativar Central de Controle na tela bloqueada.

**4.3 · Instalar a estação na tela de início**
Abrir a tela da estação no Safari → botão Compartilhar → **Adicionar à Tela de
Início** → nomear com o nome da fábrica ("Embalagem", "Etiqueta", "Carregamento").
Apagar o ícone do Safari da dock. A partir daí abre em tela cheia: sem barra de
endereço, sem abas, sem botão voltar.

**4.4 · Acesso Guiado**
`Ajustes → Acessibilidade → Acesso Guiado → Ativar`
→ `Ajustes de Código` → definir um código **que o operador não sabe**
→ `Bloqueio Automático da Tela → Nunca`

No tablet: abrir o ícone da estação e dar **três cliques no botão superior** (iPads
sem Início) para travar. O iPad passa a não sair daquela tela até alguém digitar o
código.

**4.5 · Nível fábrica de verdade (opcional, recomendado)**
Supervisionar os iPads pelo **Apple Configurator** (roda no seu MacBook, de graça) e
ativar **Single App Mode**. Diferença para o Acesso Guiado: o modo é imposto pelo
perfil de supervisão, o tablet entra nele sozinho ao ligar, e nem o código do Acesso
Guiado sai dele. É o que transforma o iPad em equipamento, não em tablet.
Custo: apagar e reconfigurar cada tablet uma vez (~20 min cada).

**4.6 · Procedimento de recuperação — escrever e colar na parede**
Em modo standalone não há barra de endereço; se a tela travar branca, o operador não
tem como recarregar. O procedimento é: três cliques no botão superior → digitar o
código → fechar o app pelo multitarefa → reabrir o ícone → três cliques para travar
de novo. Uma pessoa por turno precisa saber o código.

---

## 5. Camada 2 — o site vira app (meia hora de código)

No `<head>` de toda tela de operação — vai para o cabeçalho compartilhado quando as
telas passarem a ter um:

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Embalagem">
<link rel="apple-touch-icon" href="/icones/embalagem-180.png">
<link rel="manifest" href="/app.webmanifest">
```

`/app.webmanifest`:

```json
{
  "name": "Expedição Deccorar",
  "short_name": "Expedição",
  "start_url": "/embalagem",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#FFFFFF",
  "theme_color": "#1A1D23",
  "icons": [
    { "src": "/icones/app-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icones/app-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

E em `base.css`, no corpo das telas de operação:

```css
html { -webkit-text-size-adjust: 100%; }

body {
  touch-action: manipulation;      /* mata o zoom por toque duplo */
  overscroll-behavior: none;       /* mata o efeito elástico ao arrastar */
  -webkit-user-select: none;       /* mata a lupa e o "Copiar" no toque longo */
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

input, textarea { -webkit-user-select: text; user-select: text; }
```

Detalhes que só aparecem no iPad:

- **Nada de `target="_blank"`** nas telas de operação — em modo standalone isso pode
  jogar o operador para fora, no Safari.
- **Links relativos** para o app não sair do escopo do `start_url`.
- Um ícone por estação (`start_url` diferente), para cada tablet abrir direto na
  estação dele. É o mesmo servidor, só o atalho muda.

---

## 6. Camada 3 — o código que falta

Entra dentro do que a `ARQUITETURA-ALVO.md` já planeja para `public/bipe.js` e
`public/ui.js` (fases 2 e 6). Nada aqui é trabalho novo além da fila.

### 6.1 · O foco do leitor

O campo **visível**, nunca a `-9999px` — no Safari do iPad um campo fora do viewport
perde foco e não recupera, e é exatamente por isso que a montagem e o carregamento
falham mais que as outras. Dentro do `bipe.js`, uma vez só: foco recuperado no `blur`
e no toque em qualquer ponto da tela (com as exceções declaradas), Enter **e** Tab,
`toUpperCase`, janela anti-duplicata de 700 ms.

Se o leitor for Bluetooth HID, o iPad esconde o teclado virtual sozinho enquanto ele
está pareado. Se o teclado virtual estiver aparecendo, o leitor caiu do pareamento —
é sintoma de bateria ou de pareamento, não de software.

### 6.2 · O som, que hoje não toca

O iOS bloqueia áudio até que exista um gesto do usuário na página. Um `new
Audio().play()` no primeiro bipe do turno é engolido em silêncio. O desbloqueio é
uma vez por carregamento da tela:

```js
// ui.js — desbloqueia o áudio no primeiro toque do turno
let ctx = null;
function desbloquearSom(){
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  document.removeEventListener('touchend', desbloquearSom);
}
document.addEventListener('touchend', desbloquearSom, { once:false });

function beep(ok){
  if (!ctx) return;                      // sem gesto ainda: silêncio, não erro
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = ok ? 880 : 220;
  o.connect(g); g.connect(ctx.destination);
  g.gain.setValueAtTime(0.25, ctx.currentTime);
  o.start(); o.stop(ctx.currentTime + (ok ? 0.10 : 0.35));
}
```

Oscilador em vez de arquivo: não depende de carregar mídia, não falha sem rede, e dá
dois timbres distintos para OK e erro — que é o que o operador de fato escuta.

### 6.3 · A fila offline — e a chave que impede o bipe dobrado

Este é o único item que exige código de verdade. E tem um risco que precisa ser
tratado junto: **reenviar um bipe de embalagem sem proteção soma +1 no estoque duas
vezes.** Toda entrada na fila carrega um `evento_id` gerado no tablet, e o servidor
tem `UNIQUE` nesse campo — o segundo envio do mesmo evento é reconhecido e ignorado.

```js
// ui.js — todo POST de operação passa por aqui
async function registrar(rota, dados){
  const evento = { id: crypto.randomUUID(), rota, dados, criado: Date.now() };
  await fila.guardar(evento);                 // IndexedDB, antes de qualquer coisa
  return enviar(evento);
}

async function enviar(evento){
  try{
    const r = await fetch(evento.rota, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ ...evento.dados, evento_id: evento.id })
    });
    const j = await r.json();
    await fila.remover(evento.id);
    return j;                                  // { ok:true, dados } — confirmado
  }catch(e){
    return { ok:false, motivo:'sem_rede', pendentes: await fila.contar() };
  }
}

window.addEventListener('online', () => fila.reenviarTudo(enviar));
setInterval(() => { if (navigator.onLine) fila.reenviarTudo(enviar); }, 15000);
```

No servidor, dentro do registro de rotas (§4 da arquitetura), antes de chamar o
serviço:

```sql
CREATE TABLE IF NOT EXISTS evento_recebido (
  evento_id  TEXT PRIMARY KEY,
  rota       TEXT,
  resposta   TEXT,
  criado_em  TEXT DEFAULT (datetime('now','localtime'))
);
```

Se o `evento_id` já existe, responde a resposta guardada e **não executa de novo**.
Uma linha no núcleo protege as 103 rotas.

**Regra de tela, inegociável (regra #6 da arquitetura):** a faixa verde só aparece
quando o servidor confirmou. Enquanto a fila tiver item, a tela mostra em amarelo
`3 bipes aguardando rede` no bloco de contexto. Nenhuma tela afirma um estado que
não confirmou — é o que evita descobrir no inventário do mês.

### 6.4 · Service worker — para queda de rede não virar tela branca

Cacheia só a casca (`base.css`, `bipe.js`, `ui.js`, o HTML da estação, o ícone).
**Nunca cacheia resposta de API** — dado de fila e de estoque sempre vai à rede, e
falha vira banner, não valor velho.

```js
// sw.js
const CASCA = 'casca-v1';
const ARQUIVOS = ['/embalagem','/base.css','/bipe.js','/ui.js','/nav.js'];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CASCA).then(c => c.addAll(ARQUIVOS))));

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;        // API nunca do cache
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

---

## 7. Camada 4 — a rede

A pergunta que fica aberta e que muda muito a resposta: **os tablets falam com o
servidor pela rede local ou saem para a internet até o VPS?**

Se for pela internet, é a causa mais provável da lentidão, e nenhuma das camadas
acima resolve. Servidor de chão de fábrica fica na LAN — a queda de Wi-Fi passa a ser
o único ponto de falha, e a fila da §6.3 cobre esse.

Vale medir antes de decidir: no tablet, cronometrar o tempo entre o bipe e a faixa
verde. Acima de 300 ms, é rede.

---

## 8. Ordem de execução

| # | O quê | Esforço | Depende de |
|---|---|---|---|
| 1 | Bloqueio Automático Nunca + notificações desligadas | 5 min/tablet | — |
| 2 | Adicionar à Tela de Início + apagar ícone do Safari | 5 min/tablet | — |
| 3 | Acesso Guiado com código | 5 min/tablet | — |
| 4 | Meta tags + manifest + `base.css` do iPad | 30 min | — |
| 5 | Medir a latência do bipe; mover o servidor para a LAN se for o caso | 1 dia | medição |
| 6 | `bipe.js` único (campo visível, foco, Enter+Tab) | fase 6 | fase 2 |
| 7 | Desbloqueio de áudio + `beep()` por oscilador | 1 h | `ui.js` |
| 8 | Fila offline + `evento_recebido` + faixa amarela de pendentes | 2–3 dias | fase 1 (registro de rotas) |
| 9 | Service worker da casca | 2 h | item 4 |
| 10 | Apple Configurator + Single App Mode | 20 min/tablet | decisão |

Os itens 1 a 4 podem ir **esta semana** e derrubam três dos quatro sintomas. O item 8
é o que exige o registro de rotas da fase 1 — porque a idempotência tem que morar no
núcleo, não em cada rota.

---

## 9. Quando o app nativo se justificaria

Nenhum destes é o caso hoje. Se um dia for, a conversa muda:

- **Câmera como leitor**, sem leitor físico — a API de câmera do navegador no iOS é
  ruim para leitura contínua.
- **Falar direto com a Zebra por Bluetooth**, sem passar pelo servidor. Hoje a
  etiqueta sai do servidor; enquanto for assim, não há motivo.
- **Operar horas offline com banco local** e sincronizar depois. A fila da §6.3
  cobre minutos de queda, não turnos inteiros sem rede.
- **Notificação push** para chamar um operador que está longe do tablet.

---

## 10. Nota de hardware, para a próxima compra

iPad é a plataforma mais cara e a mais difícil de trancar para chão de fábrica. No
Android existe o **Fully Kiosk Browser** (licença única barata por dispositivo):
kiosk de verdade, tela sempre ligada, reinício automático da estação, administração
remota dos tablets pela rede, e recuperação de tela branca sem ninguém precisar saber
código nenhum. E acima disso existem coletores com leitor integrado (Zebra TC,
Honeywell) — sem Bluetooth para cair, sem pareamento para perder, gatilho físico.

Nada disso pede troca agora: os iPads que existem funcionam bem com as camadas 1 a 3.
É direção para a próxima compra, não motivo para trocar o que está na bancada.
