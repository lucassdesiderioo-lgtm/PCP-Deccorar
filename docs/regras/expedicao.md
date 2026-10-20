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
- **Exceções:** nenhuma. O passivo antigo sai pela Mesa (R-COR-02).
- **Teste que trava:** `teste_upload.js` (46).
- **Status:** no ar desde 25/08/2026.
- **História:** armadilha #5.

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

### R-COR-03 · A cancelada depois da etiqueta volta POR PEÇA, e só se alguém disser
- **Regra:** "a persiana voltou" gera movimento `cancelamento` por peça; "não voltou" só registra. As duas tiram do card. Caixa de várias só tem o "registrar". Sob medida não volta saldo.
- **Por quê:** a caixa de pacote baixou N; e a Mesa não sabe qual peça de uma caixa de várias o ML cancelou.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_correcao.js`.
- **Status:** no ar · a primeira cancelada real depois da etiqueta ainda não aconteceu.

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

### R-COR-06 · A Mesa não mexe em saldo, exceto a cancelada que voltou
- **Regra:** dar saída, fechar vencidos, reabrir e tirar da fila não mexem em estoque. "Pedir ajuste" só abre o pedido de ajuste em duas pessoas.
- **Por quê:** a peça que saiu sem etiqueta nunca somou +1, e a fila nunca somou.
- **Exceções:** R-COR-03.
- **Teste que trava:** `teste_correcao2.js`.
- **Status:** no ar.

---

## O que ainda não tem teste nesta área

R-PDF-05 (NF repetida), a parte de tela de R-VOL-05 (guard de 700 ms na
Etiqueta de Venda), R-CONF-06 (cobertura das conferências) e R-CAR-03 (o
segundo bipe cego do carregamento).
