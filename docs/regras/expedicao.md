# Regras — expedição: do PDF do Mercado Livre até a etiqueta de venda

> Cada cartão é **uma regra que vale hoje**, com o motivo, as exceções e o teste
> que impede alguém de desfazê-la. O porquê longo está em
> [`docs/historia/expedicao.md`](../historia/expedicao.md), procurando pelo
> número da armadilha.
>
> **⚠ sem teste** quer dizer que nada no código impede alguém de desfazer a
> regra sem perceber.
>
> Formato: [`README.md`](README.md). Estoque, revisão e embalagem:
> [`estoque.md`](estoque.md). Coleta, carregamento e saídas:
> [`carregamento.md`](carregamento.md).

---

## O caminho de um volume

```
PDF do ML → parse (folha + etiqueta + nota) → um volume por ETIQUETA em `lote`
   → conferências (pode reter em Bloqueados) → cruzamento (urgência)
   → Etiqueta de Venda (−1 por peça) → Carregamento
```

---

## A leitura do PDF

### R-PDF-01 · A folha de controle é lida por bloco, e o bloco não olha para trás
- **Regra:** pack, venda, comprador e cor de um item vêm da linha do `SKU:` ou de baixo; só a descrição fica acima. `folha.js → itensDaFolha()` é o único que lê a folha — o `parse.js` grava por ele e a auditoria relê por ele.
- **Por quê:** em 20/08/2026 o casamento do primeiro `SKU:` com o primeiro `Pack ID:` mandou ao Abraão Amorim uma persiana de outra medida.
- **Exceções:** R-PDF-02.
- **Teste que trava:** `teste_parse.js` (caso 2, o do Abraão).
- **Status:** no ar.
- **História:** armadilha #4.

### R-PDF-02 · A venda que subiu de linha só é aproveitada se ninguém mais a pegou
- **Regra:** quando a descrição longa desfaz o pareamento das colunas, `reivindicarAcima()` aproveita o número da linha de cima — só para item sem pack **e** sem venda, e só se houver **exatamente uma** linha livre que nenhum outro item já pegou. Duas livres: nada é escolhido.
- **Por quê:** os produtos "Tóquio" ficavam retidos sem dúvida nenhuma. A guarda do "nenhum outro pegou" é o que mantém o caso Abraão fechado.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_parse.js` (casos 22 e 23, junto com o caso 2).
- **Status:** no ar desde 23/09/2026.

### R-PDF-03 · O título do anúncio sai da estrutura da folha, não de uma palavra
- **Regra:** a descrição é a linha acima do `SKU:` que não é linha de campo; o identificador do envio sai. A medida do anúncio (inclusive `L 1,80 X A 1,50`) tem dono único: `MEDIDA_TITULO` / `medidaDoTitulo()`. Título em três linhas é emendado.
- **Por quê:** o recorte a partir de "Persiana" decapitava o título e desligava em silêncio as conferências 3 e 5.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_parse.js` (casos 20 e 24).
- **Status:** no ar · título lido em 28 de 28 no PDF real de 23/09/2026.
- **História:** armadilha #24.

### R-PDF-04 · A nota impressa é a primeira folha da NF
- **Regra:** quando a nota tem página de continuação com o mesmo número, a impressão leva a **primeira** folha. `tipoDaPagina` e `nfDaNota` (`folha.js`) são os donos da leitura crua.
- **Por quê:** a última folha vencia e saía a continuação, sem cabeçalho nem chave de acesso.
- **Exceções:** a segunda folha ainda não é impressa; `conferir_nf.js --pdf` diz se isso existe nos PDFs do servidor.
- **Teste que trava:** `teste_parse.js` (caso 16).
- **Status:** no ar desde 15/09/2026.
- **História:** armadilha #22.

### R-PDF-05 · NF repetida não é duplicidade
- **Regra:** a nota é do **pedido**: o cliente com três persianas tem três vendas, três etiquetas, três caixas e **uma** nota, impressa nas três.
- **Por quê:** venda repetida seria contradição; NF repetida é o caso normal.
- **Exceções:** NF com **clientes diferentes** é para olhar no dia (`node conferir_nf.js`).
- **Teste que trava:** ⚠ **sem teste** específico.
- **Status:** no ar.

### R-PDF-06 · O upload recusa volume que já existe no histórico inteiro
- **Regra:** Pack ID ou Venda que já existem em `lote`, em qualquer dia, não entram de novo.
- **Por quê:** com a dedup só do dia, resubir um PDF gerou 94 volumes fantasmas em 25/08/2026, cobrando etiqueta de peça que estava no caminhão.
- **Exceções:** nenhuma. O passivo antigo sai pela Mesa (R-COR-02). A venda repetida cujo PDF sumiu **não entra de novo** — só volta a ter PDF (R-PDF-07).
- **Teste que trava:** `teste_upload.js` (73).
- **Status:** no ar desde 25/08/2026.
- **História:** armadilha #5.

### R-PDF-07 · A venda repetida cujo PDF sumiu volta a ter PDF
- **Regra:** no upload, a venda que já existe e cujo PDF não está mais no disco ganha o arquivo novo (`srcfile`, `labelPage`, `danfePage`). Só isso: estágio, cliente, NF, estoque, reimpressões e quem imprimiu ficam como estavam, e ela continua contando como **repetida**. A resposta diz quantas em `religadas`, e as três telas de upload mostram.
- **Por quê:** o cron apaga os PDFs em 7 dias, e a reimpressão mandava "suba o PDF de novo" — mas até 27/10/2026 a dedup pulava a venda sem religar nada, e subir de novo não destravava a reimpressão. A tela prometia o que o sistema não fazia.
- **Exceções:** venda com PDF ainda no disco **não troca** de arquivo. Quando pack e venda existem dos dois lados, os dois têm que bater: a mesma venda com outro pack é outra etiqueta, e religar trocaria o papel da caixa.
- **Teste que trava:** `teste_upload.js` (bloco 8, escrito antes do conserto).
- **Status:** no código desde 27/10/2026, aguardando deploy. ⚠ Não foi provado com um PDF real do ML: o teste troca o `parsePdf`.

### R-PDF-08 · A busca do "Já impressos" olha o histórico inteiro, e a lista não corta calada
- **Regra:** `GET /api/impressos?q=` busca no **banco**, em todas as datas, por cliente, NF, SKU (inclusive os da caixa de várias), cidade, pack e venda — até 60 resultados. Sem `q`, a lista é a do período (até 30 dias), com teto de 400. Quando qualquer das duas bate no teto, o cabeçalho `X-Cortado` diz, e a tela avisa. Só aparece o que foi impresso (`embalado`/`carregado`). `tem_pdf` diz antes do clique se o PDF ainda está no servidor; o caminho do arquivo não viaja.
- **Por quê:** até 27/10/2026 a busca filtrava **no navegador** só as 400 da lista, e saindo ~57 caixas por dia as 400 eram uns 7 dias. O "30 dias" não trazia 30 dias, e a NF de uma semana e meia atrás dava "Nada com esse termo", calado.
- **Exceções:** nenhuma. A permissão é a mesma de antes (`etiqueta.emitir`).
- **Teste que trava:** `teste_impressos.js` (33).
- **Status:** no código desde 27/10/2026, aguardando deploy. Aberta a 1440 e a 400 px num banco semeado.

---

## Volume, peça e a caixa de várias persianas

### R-VOL-01 · Um volume é uma etiqueta; uma venda é uma etiqueta é uma persiana
- **Regra:** cada etiqueta do ML vira **uma** linha em `lote`. O volume nunca é multiplicado por quantidade.
- **Por quê:** regra do dono (01/09/2026): *"cada etiqueta de venda é para um SKU, para uma persiana"*. Multiplicar foi tentado e revertido no mesmo dia.
- **Exceções:** a caixa de várias persianas (R-VOL-02), que continua sendo **um** volume.
- **Teste que trava:** `teste_parse.js` (caso 9) · `teste_cruzamento.js` (caso 1) · `teste_etiqueta.js` (caso 1).
- **Status:** no ar.
- **História:** armadilha #8.

### R-VOL-02 · O que vai dentro da caixa é `lote_item`, e conta-se PERSIANA
- **Regra:** a peça é o grão do `lote_item`. Toda pergunta "é caixa de várias?" soma as `qtd` — nunca conta linhas —, no servidor **e** na tela (`pecasDe()` no `embalagem.html`). `folha.js → pecasDaCaixa()` responde as duas formas: 2 SKUs (o de baixo órfão) e 1 SKU com `Quantidade: N`.
- **Por quê:** contando linha, a NF 6490 saiu com uma de duas persianas, e a NF 7031 travou a bancada num laço sem saída.
- **Exceções:** o upload conta linha de propósito, porque lá a pergunta é "são vários SKUs?" (R-VOL-04).
- **Teste que trava:** `teste_parse.js` (casos 9, 17, 18) · `teste_etiqueta.js` (varre a tela recusando `itens.length>1`).
- **Status:** no ar · tela da NF 7031 conferida pelo dono em 25/09/2026.
- **História:** armadilha #23.

### R-VOL-03 · O irmão do pacote se reconhece por ausência — e só quando o PDF fecha
- **Regra:** um item é peça a mais (irmão) quando não tem pack, nem venda, nem comprador, **e** nenhuma etiqueta do PDF ficou sem item (`pdfFecha`). Item com venda ou comprador nunca é irmão. A licença gateia só os órfãos: a `Quantidade: N` escrita no item vale sempre.
- **Por quê:** sem a conta do documento, um item com campos ilegíveis viraria peça a mais e juntaria duas vendas numa caixa que não existe.
- **Exceções:** sobrou etiqueta sem item: retém só **aquele** volume, como `divergencia:` (R-CONF-03).
- **Teste que trava:** `teste_parse.js` (casos 2, 17, 19, 20, 21).
- **Status:** no ar · o padrão nasceu de **um** PDF (NF 6585): acompanhe `pacotes` e `folha_nao_fecha` na resposta do upload.

### R-VOL-04 · Só o pacote de vários SKUs fica retido; a caixa de N unidades não
- **Regra:** 2 SKUs na mesma etiqueta: retém com `pacote:` e alguém assina as peças em Admin → Bloqueados (`pacote.assinar`). 1 SKU com `Quantidade: N`: não retém — a folha escreveu o número.
- **Por quê:** reter venda de 2 unidades pararia a rotina, e trava que dispara no caso normal vira desvio.
- **Exceções:** cadastrar SKU não solta volume retido por `pacote:`.
- **Teste que trava:** `teste_upload.js` · `teste_divergencia.js` · `teste_acesso.js` (a chave e o backfill).
- **Status:** no ar desde 15/09/2026.

### R-VOL-05 · A Etiqueta de Venda não imprime a caixa de várias sem o bipe de cada persiana
- **Regra:** tela âmbar com a lista das peças; **um bipe por persiana** (`lote_item.conferidos` é contador). Sem todas, não imprime. Baixa uma por peça, e a recusa de estoque diz qual SKU faltou. O guard de 700 ms da tela não pode ser afrouxado.
- **Por quê:** a lista diz o que buscar na prateleira; o bipe prova o que entrou. A repetição do leitor contaria uma persiana a mais.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_etiqueta.js` (68) · ⚠ **sem teste** do guard de 700 ms nesta tela (o do Carregamento tem, em `teste_pecas_carga.js`).
- **Status:** no ar.

### R-VOL-06 · A caixa de várias aparece antes do bipe, e uma vez só
- **Regra:** ela é desenhada como bloco âmbar dentro da coluna Agência ou Coleta (e no painel "Pra despachar depois", na data dela), com as peças, o "sem estoque" por peça e a frase da `fita(n)`. Ela **sai** das linhas por SKU (`VARIAS()`, a mesma régua do `caixasDeVarias`). O painel "depois" e a lista do dia saem do mesmo `linhasDeSku`. No "Já impressos" ela tem a tarja `📦 N persianas` e a lista das peças (`pecas_caixa.js`).
- **Por quê:** descobrir no bipe que são três é descobrir com a caixa já montada; mostrar em dois lugares fez o dono ler duas vendas.
- **Exceções:** a marca de modalidade só aparece onde separa algo (o painel "depois" misturado).
- **Teste que trava:** `teste_divergencia.js` · `teste_etiqueta.js` (a frase e as peças da caixa impressa).
- **Status:** no ar · conferido pelo dono em 25/09/2026 (opção B e frase) e 05/10/2026 (NF 7446).

### R-VOL-07 · A frase da caixa é uma só
- **Regra:** *"⚠ Atenção: vão N persianas no mesmo pacote — embalar junto. Tire a etiqueta de SKU do saco de cada persiana e cole por fora da caixa."* Sai da `fita(n)` e aparece igual nos quatro lugares; no painel "depois" vai por caixa.
- **Por quê:** a cor diz que é diferente; só a frase diz o que fazer.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_etiqueta.js` (recusa a frase antiga do "saco maior").
- **Status:** no ar desde 25/09/2026.

### R-VOL-08 · O backfill do pacote relê o PDF, e só tem 7 dias
- **Regra:** `backfill_pacote.js` grava as peças dos volumes de antes de 15/09, pelas duas formas (`pecasDaCaixa`). Acertar o saldo dos já impressos só com `--baixar`, depois de conferir a caixa. Faz backup e é idempotente.
- **Por quê:** o cron apaga os PDFs em 7 dias; depois disso as peças não voltam por script nenhum.
- **Exceções:** volume já carregado fica de fora.
- **Teste que trava:** `teste_parse.js` (caso 20, a licença no backfill).
- **Status:** disponível · em 23/09/2026 eram 82 volumes já fora da janela.

---

## As conferências e a retenção

### R-CONF-01 · Cinco conferências, e qualquer uma retém o volume
- **Regra:** retém como `divergencia:` quando divergem: (1) as duas leituras da folha; (2) o comprador da etiqueta × o do bloco; (3) a medida do anúncio × a do código do SKU; (4) a cor do anúncio × a do código; (5) a família do anúncio × o prefixo do SKU, contra o que o sistema já viu.
- **Por quê:** a 2 é a única que não depende do Pack ID; a 5 separa o que medida e cor não separam.
- **Exceções:** só acusam com os **dois lados** lidos — falta de dado nunca vira bloqueio. A 5 só vale depois de **5 ocorrências** do par.
- **Teste que trava:** `teste_parse.js` · `teste_upload.js` (a conferência 5 e a ordem das travas).
- **Status:** no ar.

### R-CONF-02 · A trava não acusa o inocente
- **Regra:** o nome partido pelo PDF é remontado (`nomeDaEtiqueta()`); a cor do código que aparece no texto do anúncio passa; nomes diferentes só pela letra repetida passam (`mesmoNomeComRepeticao()`), e nunca por distância de edição. `nome.js` é o dono de "é a mesma pessoa?".
- **Por quê:** em 31/08/2026 havia 10 volumes retidos e os 10 estavam certos. `Marcelo`/`Marcela` estão a duas letras e são duas pessoas.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_parse.js` (casos 12 a 14).
- **Status:** no ar.
- **História:** armadilha #10.

### R-CONF-03 · Retém o volume com dúvida, nunca o PDF inteiro
- **Regra:** quando o PDF não fecha, só fica retida a etiqueta que não achou item na folha; as outras seguem.
- **Por quê:** em 23/09/2026 a regra global retinha 28 volumes por 5 dúvidas, e escondia da bancada a caixa de várias de outro cliente.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_parse.js` (caso 21).
- **Status:** no ar.

### R-CONF-04 · A ordem das travas do upload
- **Regra:** divergência > pacote > folha que não fecha > modalidade > SKU sem cadastro. A trava é por volume.
- **Por quê:** a mais grave responde primeiro; nenhuma das seguintes responde pelo conteúdo da caixa.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_upload.js`.
- **Status:** no ar.

### R-CONF-05 · Quem retém sabe liberar
- **Regra:** Admin → Bloqueados mostra o motivo, o anúncio como o ML escreveu e as opções tiradas do cadastro de SKU (o código gravado vem primeiro), com campo que aceita bipe. Resolver grava `bloqueio_resolvido`, quem e quando, e vai para a auditoria. SKU fora do cadastro não solta.
- **Por quê:** até 01/09/2026, quatro dos cinco motivos prendiam o volume para sempre.
- **Exceções:** cadastrar SKU solta só o volume retido por `sku_nao_cadastrado` — nunca divergência, pacote ou modalidade.
- **Teste que trava:** `teste_divergencia.js` (os motivos com o texto exato do `parse.js`).
- **Status:** no ar.

### R-CONF-06 · A cobertura das conferências é medida
- **Regra:** a auditoria (`/api/auditoria/skus`) diz quantos volumes cada conferência conseguiu conferir; abaixo de 100% fica âmbar.
- **Por quê:** trava que para de acusar faz o mesmo silêncio de "está tudo certo".
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste**.
- **Status:** no ar.

---

## O cruzamento e a urgência

### R-URG-01 · O PDF gera só urgência
- **Regra:** `cruz_route.js` compara os volumes `pendente` com o estoque: sem estoque vira produção **urgente**; com estoque sai direto pela Etiqueta de Venda, sem ordem. A reposição vem da tela azul.
- **Por quê:** a urgência se corrige sozinha — o volume processado sai de `pendente`.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_cruzamento.js` (14).
- **Status:** no ar desde 14/08/2026.

### R-URG-02 · O recálculo é idempotente e não apaga o manual
- **Regra:** `POST /api/cruzamento/aplicar` apaga as ordens `origem='ml'` do dia e refaz. O lançamento manual fica.
- **Por quê:** subir o mesmo PDF duas vezes não pode duplicar a ordem.
- **Exceções:** ⚠ manual e PDF no mesmo SKU **duplicam** a ordem: PDF cobre venda, manual cobre produção sem venda.
- **Teste que trava:** `teste_cruzamento.js`.
- **Status:** no ar.

---

## Dentro desta área, o carregamento

### R-CAR-01 · O carregamento não filtra por dia
- **Regra:** "está pra carregar?" é `estagio='embalado'`, sem olhar `data` (`carga.js`). `carregados` conta por `carregado_em`. O atrasado sai marcado e em cima.
- **Por quê:** volume embalado ontem sumia das três consultas, e o bipe respondia "não encontrado" com a caixa na mão.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_carga.js`.
- **Status:** no ar.
- **História:** armadilha #9.

### R-CAR-02 · Só carrega o que passou pela Etiqueta de Venda
- **Regra:** o bipe recusa volume não `embalado` (`nao_embalado`), diz por onde imprimir e grava na auditoria. `GET /api/print/:id` não imprime volume `pendente`.
- **Por quê:** a peça saía da fábrica sem o −1, e o saldo ficava alto para sempre.
- **Exceções:** reimpressão de volume `embalado` ou `carregado` continua (R-EST-04).
- **Teste que trava:** `teste_carga.js`.
- **Status:** no ar desde 17/09/2026 · o passivo se conta com `conferir_carregados.js` (só lê).
- **História:** armadilha #27.

### R-CAR-03 · O segundo bipe do carregamento, quando ligado, é cego
- **Regra:** com `config.conf_carregamento='1'`, carregar pede a etiqueta de venda e o SKU da mesma caixa; o SKU esperado não aparece antes. Nasce desligada.
- **Por quê:** quem sabe a resposta bipa o que for para fechar a linha.
- **Exceções:** a caixa de várias substitui este bipe pelo bipe de cada peça (§8-B).
- **Teste que trava:** ⚠ **sem teste**.
- **Status:** no ar, desligada.

---

## A Mesa de correções e o passivo

### R-COR-01 · A Mesa corrige pela ação, nunca pela linha
- **Regra:** cada objeto mostra só as ações que valem para ele; a que não vale aparece desabilitada com o motivo. A prévia não grava. Executar exige motivo e grava em `correcao`. Desfazer compara os sete campos de "andou" e recusa nomeando o campo; bloco é tudo ou nada.
- **Por quê:** apagar linha à mão quebra saldo e fila em silêncio.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_correcao.js` (115) · `teste_correcao2.js` (98).
- **Status:** no ar desde 02/10/2026 · conferida na fábrica: **ainda não**.

### R-COR-02 · Fantasma é o volume `pendente` cujo irmão MAIS ANTIGO já andou
- **Regra:** `correcoes.classificarFantasmas` é a única régua; o `limpar_fantasmas.js` lê dela. Varre o `lote` por id. Descartar apaga o volume **e** as peças; desfazer volta com o mesmo id e recusa id ocupado.
- **Por quê:** duas réguas seriam o botão e o terminal apagando linhas diferentes.
- **Exceções:** duplicata com irmão `pendente` ou `bloqueado` não é fantasma.
- **Teste que trava:** `teste_correcao.js` · `teste_correcao3.js`.
- **Status:** no ar.

### R-COR-03 · A cancelada depois da etiqueta: a Mesa só registra a que não voltou
- **Regra:** desde 22/10/2026 (CONFERENCIA-E-BAIXA, fase 2-B) o card de canceladas tem uma saída só: **"Não voltou — só registrar"**, que tira do card sem mexer em saldo. A persiana que está na fábrica volta pelo **↩ Sobrou** da Conferência (R-REC-01), com o bipe do SKU. O "voltou" mandado à rota é recusado (409), mandando para lá. O "não voltou" de caixa que nunca baixou avisa que o saldo fica alto e manda pedir ajuste. Desfazer uma correção "voltou" de antes da 2-B ainda devolve o −1 que ela gravou.
- **Por quê:** a Mesa não tem como provar que a persiana está na mão; o bipe do SKU tem.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_correcao.js`, `teste_sobra.js`.
- **Status:** "voltou" pela Mesa no ar de 02/10 a 22/10/2026 · a regra nova está em código desde 22/10/2026.

### R-COR-04 · Saída de passivo é carimbada na data do volume, e venda futura não se fecha
- **Regra:** dar saída e fechar vencidos carimbam `COALESCE(despachar_em, data)` às 15:00, nunca hoje. Volume com despacho no futuro é recusado. Reabrir venda futura volta a `embalado`, ou a `pendente` se nunca teve etiqueta. A data de corte de "Fechar vencidos" nasce vazia.
- **Por quê:** carimbar hoje cria pico falso e some com o volume da tela no dia em que ele sair de verdade.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_correcao2.js`.
- **Status:** no ar desde 02/10/2026.

### R-COR-05 · O terminal e o botão usam a mesma régua
- **Regra:** os scripts de passivo (`limpar_fantasmas`, `fechar_vencidos`, `regularizar_saida`, `reabrir_futuros`, `limpar_fila`) chamam as ações do `correcoes.js` e gravam em `correcao`, com `terminal: <script>` como autor.
- **Por quê:** o mesmo cenário corrigido pelos dois caminhos tem que dar o mesmo banco.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_correcao3.js` (monta dois bancos e compara linha a linha).
- **Status:** no ar.

### R-COR-06 · A Mesa nunca mexe em saldo
- **Regra:** dar saída, fechar vencidos, reabrir, tirar da fila e registrar a cancelada não mexem em estoque (desde 22/10/2026 sem exceção: o "voltou" virou o Sobrou da Conferência, R-REC-01). "Pedir ajuste" só abre o pedido de ajuste em duas pessoas. **A Mesa nunca dá a baixa** (CONFERENCIA-E-BAIXA, D7): "dar saída" numa caixa impressa que nunca foi conferida avisa na prévia que o saldo fica uma peça acima, e manda pedir ajuste.
- **Por quê:** a peça que saiu sem etiqueta nunca somou +1, e a fila nunca somou.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_correcao2.js`, `teste_sobra.js`.
- **Status:** no ar.

### R-COR-07 · Conferências antigas fecham em bloco, até uma data que nunca é hoje, sem mexer em saldo
- **Regra:** "Fechar conferências antigas" (Admin → Correções, contador "caixas impressas sem conferência") pega a caixa `embalado`, nunca conferida, fora do modo teste, impressa até a data de corte, que não está no carro nem numa saída e que não despacha no futuro. A data é **obrigatória** e **não pode ser hoje**. Cada caixa vira `carregado` na data de despacho às 15:00 — ou no dia da impressão, se foi impressa depois —, a coleta ganha `retirado_em`, e `conferido_em`/`conferido_por` ficam **vazios**. Não mexe em estoque. **Só pega caixa que já baixou** (`baixado_em` cheio — as de antes da virada de 22/10/2026); a que nunca baixou fica de fora, e a prévia diz quantas — fechá-la deixaria o saldo alto em silêncio. Uma linha em `correcao` para o bloco; desfazer é tudo ou nada. O contador é a mesma lista da linha âmbar do Carregamento (R-PIL-02). `fechar_conferencias_antigas.js --ate AAAA-MM-DD [--aplicar]` chama a mesma ação.
- **Por quê:** a tela do Carregamento ficou um tempo com problema e mais de 500 caixas impressas se acumularam sem conferência. A baixa delas já aconteceu na impressão; a caixa de hoje ainda é trabalho da conferência; e escrever um nome em `conferido_por` mentiria na pilha.
- **Exceções:** a caixa de venda cancelada que ainda está na fábrica não entra: quem fecha passa antes na área e no canto, e escolhe a data de corte antes dela.
- **Teste que trava:** `teste_conferencia_antiga.js` (64) · `teste_correcao.js` (a lista dos contadores).
- **Status:** no ar desde 22/10/2026 (PR #216, fase 0 da spec `CONFERENCIA-E-BAIXA`) · ✅ o passivo real foi fechado pela tela em 22/10/2026 (relato do dono).

---

## O que ainda não tem teste nesta área

R-PDF-05 (NF repetida), a parte de tela de R-VOL-05 (guard de 700 ms na
Etiqueta de Venda), R-CONF-06 (cobertura das conferências) e R-CAR-03 (o
segundo bipe cego do carregamento).

## O que NÃO fazer

> Vieram do CLAUDE.md §15 sem alteração, na ordem em que estavam. As
> referências entre parênteses (§N) apontam para a seção do CLAUDE.md onde
> a regra morava, hoje em cartão neste arquivo ou na história da área.
> O último veio depois, e ganhou a referência (§5) que não trazia.

- ❌ Escrever uma segunda régua de "isto é fantasma?": ela é o
  `correcoes.classificarFantasmas`, e o `limpar_fantasmas.js` lê dela — duas
  cópias são o botão e o terminal apagando linhas diferentes (§5, a Mesa)
- ❌ Trocar a varredura do fantasma por um `SELECT` de `MIN(id)` "porque é igual":
  não é — com #1 só-venda, #2 venda+pack e #3 só-pack as duas respondem
  diferente, e a régua é **o irmão mais antigo** (§5, a Mesa)
- ❌ Dar o "voltou" à caixa de várias persianas: o ML cancelou **um item** e o
  sistema não sabe qual peça é — só o "registrar" existe (§5, a Mesa)
- ❌ Deixar a prévia da Mesa gravar qualquer coisa: é ela que separa a Mesa de um
  `UPDATE` na mão (§5, a Mesa)
- ❌ Esconder a ação que não vale em vez de desabilitá-la com o motivo escrito —
  botão que some não responde nada a quem foi procurar por ele (§5, a Mesa)
- ❌ Devolver o volume do fantasma por cima de um id ocupado, ou sem as peças que
  o `antes` guardou (§5, a Mesa)
- ❌ Pôr na Mesa um contador sem a ação dele: acusar sem saber liberar é a trava
  que a equipe aprende a contornar (§5, a Mesa, e Bloqueados → escolher)
- ❌ Fazer um script de passivo escrever no `lote` ou na `fila` por conta própria:
  ele chama a ação do `correcoes.js` e grava em `correcao` — terminal e botão com
  a mesma régua (§5, a Mesa F3)
- ❌ Pré-preencher a data de corte de "Fechar vencidos": ela é a prova de que
  alguém conferiu o Mercado Livre (§5, a Mesa F2)
- ❌ Reabrir como `embalado` a venda futura que nunca teve etiqueta: embalado sem
  o −1 é a armadilha #27 (§5, a Mesa F2)
- ❌ Desfazer metade de um bloco: um volume que andou trava o bloco inteiro
  (§5, a Mesa F2)
- ❌ Multiplicar volume por "quantidade" em qualquer lugar — uma venda é uma
  etiqueta é uma persiana (§5); já foi tentado e revertido, e há teste travando
- ❌ Fazer a leitura por pedaços (`split` em `Desenho do tecido`) voltar a rodar
  antes do tokenizer no `parse.js` — manda a peça errada pro cliente (§5)
- ❌ Criar N linhas em `lote` para uma etiqueta que leva N persianas — o grão de
  `lote` é a ETIQUETA, o de `lote_item` é a PEÇA (§5, armadilha #23)
- ❌ Deixar a caixa de pacote imprimir sem o bipe de todas as peças, ou baixar
  só uma do estoque: saíram N da prateleira (§5, armadilha #23)
- ❌ Fechar a linha do `lote_item` num bipe só quando ela tem 2 unidades — é um
  bipe por PERSIANA, e a irmã fica na prateleira (§5, armadilha #23)
- ❌ Tratar como irmão de pacote um item que traz `Venda:` ou comprador — esse é
  o caso Abraão, e herdar ali manda a peça errada pro cliente (§5, #4 e #23)
- ❌ Ler ausência como pacote quando o PDF **não fecha** (sobrou etiqueta sem
  item na folha): ali é leitura quebrada, não peça a mais (§5, armadilha #23)
- ❌ Chamar `irmaosDoPacote` sem a licença do `pdfFecha` — foi assim que o
  `backfill_pacote.js` nasceu, e lá o erro **baixa estoque** (§5, #23)
- ❌ Decidir "isto é caixa de várias persianas?" contando `itens.length` — uma
  linha com `qtd:2` é UMA linha e DUAS persianas, e foi assim que a NF 6490 saiu
  com uma de duas. Todo portão conta a soma das `qtd` (§5, #23) — **inclusive
  os da TELA**: o `embalagem.html` ficou em `length` e a NF 7031 entrou em laço
  no bipe; lá a conta é a `pecasDe()`, e há varredura recusando
- ❌ Dar por consertada uma regra do servidor sem procurar a MESMA pergunta na
  tela: a tela tem os portões dela, e nenhum teste de rota os enxerga (§5, #23)
- ❌ Reter o PDF inteiro porque ele não fecha: a dúvida é do volume que **não
  achou item** na folha. Um lote de 28 com 5 leituras quebradas retinha os 28,
  e escondia da Etiqueta de Venda as caixas de várias peças (§5, #23)
- ❌ Fazer o `reivindicarAcima` pegar identificador que **outro item já usou**:
  é exatamente o caso Abraão, e ali o pack de cima é do vizinho (§5, #4)
- ❌ Desempatar duas linhas livres acima do `SKU:` por proximidade ou por ordem
  — ambiguidade sem resposta não vira palpite, fica como está (§5, #4)
- ❌ Reter em Bloqueados a venda de N unidades do MESMO SKU: a folha escreveu a
  quantidade, não há o que assinar, e travar o caso normal é a #6 (§5, #23)
- ❌ Deixar a pessoa descobrir no BIPE que a caixa leva três — ali ela já montou;
  o bloco da caixa na coluna existe para ela saber antes da prateleira (§5, #23)
- ❌ Deixar o painel "Pra despachar depois" contar `COUNT(*)` e ler só o
  `lote.codigo`: o número mente e o segundo SKU não aparece em tela nenhuma —
  e aquele painel CONVIDA a adiantar, com o bipe que não filtra por prazo
  (§5, #23)
- ❌ Escrever uma segunda consulta de "quais caixas levam mais de uma persiana":
  ela é do `caixasDeVarias`, e a cópia que fica para trás é sempre a do
  "depois", que ninguém olha todo dia (§5, #23)
- ❌ Trocar o `?quando=` por uma rota nova, ou fazer o parâmetro ausente
  significar outra coisa: o tablet com a página em cache chama sem ele (§5, #23)
- ❌ Escrever uma segunda consulta para a linha da lista de SKU: a do dia e a do
  painel "depois" saem do mesmo `linhasDeSku`, e foi a cópia que ficou para trás
  que deixou o painel sem medida, sem cor e **sem estoque** (§5, #23)
- ❌ Escrever "✓ dá pra adiantar" no SKU com saldo: o saldo é o MESMO da fila de
  hoje, e a promessa manda gastar peça de quem tem prazo curto (§5, #23)
- ❌ Repetir a marca de modalidade numa lista que já é de uma modalidade só — a
  marca só aparece quando ela separa alguma coisa (§5, #23)
- ❌ Dividir o painel "depois" em colunas Agência e Coleta: em 23/09/2026 o
  futuro era 22 de 22 coleta, e coluna vazia todo dia vira paisagem (§5, #23)
- ❌ Perguntar "quais peças vão nesta caixa?" fora do `folha.js → pecasDaCaixa`:
  são DUAS formas (2 SKUs órfão, e 1 SKU com `Quantidade: N`), e a cópia que
  fica para trás é a do script que ninguém roda todo dia (§5, #23)
- ❌ Fazer o `backfill_pacote.js` voltar a varrer só `irmaosDoPacote`: ele
  deixava de fora a forma COMUM, e foi assim que a NF 6986 ficou invisível para
  o único reparo que existe (§5, #23)
- ❌ Descartar o PDF inteiro porque ele não fecha: a licença gateia os ÓRFÃOS,
  não a `Quantidade: N` escrita no próprio item — é a retenção em massa por
  outra porta (§5, #23)
- ❌ Escrever "gravado" numa linha de `qtd 2` no relatório do backfill: o
  sistema conhece UMA, e é por isso que o script existe (§5, #23)
- ❌ Deixar o "Já impressos" sem a tarja `📦 N persianas`: é o ÚLTIMO lugar em
  que a caixa aparece, e é dali que se reimprime (§5, #23)
- ❌ Voltar a buscar o "Já impressos" só dentro da lista que já veio, ou deixar
  a lista bater no teto sem dizer: o "30 dias" virava 7, calado (R-PDF-08)
- ❌ Fazer o upload religar PDF de venda que ainda tem o dela, ou mexer em
  qualquer outra coluna da venda repetida: ela continua repetida (R-PDF-07)
- ❌ Devolver a caixa de várias persianas à linha por SKU, ou recriar o quadro
  do topo: ela aparece UMA vez, dentro da coluna da porta de saída — em dois
  lugares o dono leu duas vendas (§5, #23, opção B de 25/09/2026)
- ❌ Escrever uma segunda régua de "caixa de várias" para tirá-la das linhas:
  é o `VARIAS()` do `exp_route.js`, o mesmo do `caixasDeVarias` — com duas, a
  caixa some das duas listas ou aparece nas duas (§5, #23)
- ❌ Escrever só o `lote.codigo` na caixa de várias persianas já impressa: ele
  é o PRIMEIRO item, e dois SKUs diferentes se leem como um repetido — a lista
  sai do `pecas_caixa.js` e da `pecasCaixa` da tela (§5, NF 7449)
- ❌ Escrever a instrução de embalagem diferente em cada tela, ou sem o número:
  é uma frase só, a `fita(n)` — *"Atenção: vão N persianas no mesmo pacote —
  embalar junto"* (§5, #23)
- ❌ Deixar cadastro de SKU soltar volume retido por `pacote:` — cadastro não
  responde quantas persianas vão na caixa (§5, armadilha #23)
- ❌ Declarar chave nova em `permissoes.js` sem a linha no `permDaRota()` **e**
  sem o backfill de quem já devia tê-la: a rota fica em `@logado` ou a tela dá
  403 para todo mundo, nos dois casos sem erro e sem log (§5, armadilha #23)
- ❌ Deixar `POST /api/lote/conferir` cair no `pre('/api/lote')` → `pdf.subir`:
  o bipe das peças é da bancada da etiqueta, e sem ele ela não imprime (§5, #23)
- ❌ Tratar NF repetida como duplicidade: a nota é do **pedido**, e o cliente com
  três persianas tem três vendas e uma nota só (§5, armadilha #22)
- ❌ Deixar o mapa `danfeByNf` sem guarda: a última folha da nota vence e a
  impressão sai com a continuação no lugar do documento (§5, armadilha #22)
- ❌ Escrever uma segunda régua de "que página é esta" / "qual o número desta
  nota" — as duas são do `folha.js`, e é por elas que a impressão gravou (§5)
- ❌ Recortar a descrição do anúncio a partir de uma palavra ("Persiana"): o ML
  escreve o título com ela no fim, e o recorte leva junto a medida que a
  conferência 3 lê e a família que a 5 aprende (§5, armadilha #24)
- ❌ Comparar nome de cliente fora do `nome.js`, ou com distância de edição:
  `Marcelo`/`Marcela` estão a duas letras e são duas pessoas (§5, #10 e #22)
- ❌ Deixar o carregamento aceitar volume que não está `embalado`: a peça sai da
  fábrica sem o −1, o saldo fica alto para sempre e a venda some da conta de
  urgência — sem sinal em tela nenhuma (§5, armadilha #27)
- ❌ Voltar a imprimir a etiqueta de venda de um volume `pendente` pelo
  `GET /api/print/:id`: é o segundo caminho que punha etiqueta na mão sem baixa,
  e quem baixa a peça é o `POST /api/embalar` da bancada (§5, armadilha #27)
- ❌ Recusar uma caixa no carregamento sem dizer por onde ela tem que passar — a
  pessoa está na frente do carro com a caixa na mão (§5, armadilha #27)
- ❌ Ler a marca das 15:00 do `conferir_carregados.js` como se valesse desde
  sempre: ela só existe a partir de 26/08/2026, e antes disso o fechamento à
  mão sai com hora de gente (§5, armadilha #27)
- ❌ Baixar para **dois** o mínimo do bloco no mesmo segundo, ou contá-lo dentro
  da janela: o primeiro esconde furo que ninguém vai procurar, o segundo faz o
  volume mudar de classificação conforme o argumento da linha de comando
  (§5, armadilha #27)
- ❌ Desfazer uma correção sem comparar o estado: o volume pode ter andado, e
  desfazer por cima de trabalho novo é a armadilha #32 pela porta da Mesa
  (§5, a Mesa)
