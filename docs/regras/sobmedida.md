# Regras — sob medida (`/sobmedida`)

> Cada cartão é **uma regra que vale hoje**, com o motivo, as exceções e o teste
> que impede alguém de desfazê-la. O porquê longo está em
> [`docs/historia/sobmedida.md`](../historia/sobmedida.md), procurando pelo
> número da armadilha.
>
> **⚠ sem teste** quer dizer que nada no código impede alguém de desfazer a
> regra sem perceber.
>
> Formato: [`README.md`](README.md). O módulo tem regras próprias também no
> [`tecido/README.md`](../../tecido/README.md). **Partes 1 e 2 de 4:** o
> módulo, o acesso, o design e a estante de tecido (parte 1); o catálogo, a
> revenda, o pedido e a etiqueta de produção (parte 2). Consumo, produção,
> quadro, indicadores, financeiro e o corte em etapas continuam no `CLAUDE.md`
> §19 até serem passados para cá.

---

## As duas operações

| | **Medida padrão** | **Sob medida** |
|---|---|---|
| O que é | Persianas prontas, vendidas pelo Mercado Livre | Corte de tecido contra o pedido do cliente |
| Onde vive | o `CLAUDE.md` até a §18 | `tecido/`, montado em `/sobmedida` |
| Banco | `dados.db` | `tecido.db` |
| Entra pelo | mesmo PIN | mesmo PIN |

---

## O módulo

### R-SMM-01 · O sob medida é um módulo montado no mesmo servidor, dentro de um try/catch
- **Regra:** `server.js` monta o módulo depois do `teste_route` com `try{ require('./tecido/montar').montar(app); }catch(e){ /* 503 só no /sobmedida */ }`. Não há segundo servidor nem segunda porta, e não há `npm install` dentro de `tecido/` (as dependências são as da raiz).
- **Por quê:** o módulo roda migrações no boot; um `tecido.db` corrompido ou um disco cheio derrubaria, sem o try/catch, a expedição inteira. E a versão em outro servidor durou um dia: o iframe do `/admin` abria o login do outro sistema, a porta 3020 não estava no `ufw` e liberar alguém exigia já estar liberado.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste** — nada sobe o `server.js` com o `tecido.db` quebrado.
- **Status:** no ar desde 02/09/2026.
- **História:** "É um módulo montado" e "Por que a liberação não mora mais lá dentro".

### R-SMM-02 · O sob medida não tem cadastro de gente: a liberação é uma área do PCP
- **Regra:** quem entra no módulo é quem tem a área certa em Admin → Acessos. O portão (`tecido/montar.js`) lê `req.usuario.areas`.
- **Por quê:** dois cadastros de gente são dois lugares para lembrar de bloquear alguém; desligar no PCP e esquecer do outro é o furo que nenhum log acusa.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/acesso.test.js`.
- **Status:** no ar desde 02/09/2026.

### R-SMM-03 · O backup diário cobre o `tecido.db`
- **Regra:** o `backup.js` copia os dois bancos (§13). O caminho do `tecido.db` é do `tecido/nucleo/caminho.js`.
- **Por quê:** até 28/09/2026 o cron copiava só o `dados.db`, sem erro nenhum.
- **Exceções:** o `/baixar-backup` continua servindo só o `dados-*.db`.
- **Teste que trava:** `teste_backup.js`.
- **Status:** no ar e conferido com dado real em 28/09/2026.

---

## O acesso

### R-SMA-01 · A área do sob medida é SOMBRA: chave, setor e linha no `PERM_AREA` andam juntos
- **Regra:** `usuarios.areas` é recalculada a partir das permissões pelo `PERM_AREA` do `acesso.js`. Toda área do sob medida precisa das três pontas: a chave em `permissoes.js`, o setor em `setoresNativos` e a linha em `PERM_AREA`. `areas` é **saída**: nada a lê para decidir alguma coisa.
- **Por quê:** área fora do mapa é apagada no primeiro salvamento de acesso de qualquer pessoa — o acesso some sozinho, sem erro. E lida como entrada, ela promovia a Admin Geral (§10, armadilha #28).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/acesso.test.js` (as duas pontas) · `teste_acesso.js`.
- **Status:** no ar.
- **História:** armadilha #13.

### R-SMA-02 · A chave do cadastro do sob medida é `supervisor`, nunca `admin`
- **Regra:** `sobmedida.cadastrar` é `nivel:'supervisor'`, e o setor `Sob medida / Cadastros` também. O setor nativo `Admin` **não** a carrega (a lista dele é calculada como "toda chave de nível admin").
- **Por quê:** nível admin no PCP é "admin do PCP": `sincronizarAreas` dá a área `'admin'` e as 24 rotas `@admin` liberam. E o setor com nível menor que a chave que carrega a apaga em silêncio no próximo salvamento (a tela não desenha a caixinha). Dentro do módulo nada mudou: o `papelDe` devolve `diretor` para `sobmedida_adm`, como sempre.
- **Exceções:** as outras 23 chaves de nível admin do PCP continuam entrando no sob medida como diretor; estreitar isso é `REGRA`.
- **Teste que trava:** `teste_acesso.js` (seção 6-D) · `tecido/teste/acesso.test.js`.
- **Status:** no ar e conferida em produção em 24/09/2026 (uma pessoa saiu com `sobmedida_adm` e sem `admin`).
- **História:** armadilha #34. O defeito de tela que apaga a chave continua aberto (dívida 20 do §14).

---

## O design

### R-SMD-01 · O contexto (claro ou escuro) é por tela, e a paleta é a mesma do PCP
- **Regra:** cada tela declara o contexto em `tecido/nucleo/telas.js`, e o servidor carimba `data-contexto` no `<html>`. Os hex são **copiados** de `public/operador.html` e `public/index.html`. Cor nova no `tecido/public/base.css` só entra se existir também nas telas do PCP.
- **Por quê:** a primeira versão usou uma paleta *quase* igual, em sete cores, e o efeito era a equipe sentir que tinha entrado em outro sistema.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste**.
- **Status:** no ar.

---

## A estante de tecido

### R-SME-01 · A bancada cria largura de bobina e endereço, e o cadastro nasce marcado para conferir
- **Regra:** criar endereço e largura é da bancada (`endereco.criar`); o cadastro nasce com `conferir=1` e quem criou, e aparece na lista **Conferir** no topo de Cadastros (`dominio/conferir.js`). Renomear e apagar continuam com `cadastro.editar`.
- **Por quê:** com o cadastro só da supervisão, a bancada mentia — tocava a largura errada para o sistema aceitar, ou lançava o rolo sem endereço. As duas peças são obrigatórias: soltar sem marcar é soltar sem rastro, e marcar sem a lista é ninguém conferir.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/bancada.test.js`.
- **Status:** no ar desde 03/09/2026.
- **História:** armadilha #14.

### R-SME-02 · Cada nível guarda um rolo só
- **Regra:** `Haste A · Andar 1 · Nível 1` é um buraco, e nele cabe **um** tubo de tecido novo. Ele se esvazia sozinho por dois caminhos: Mover, ou Rolo acabou (rolo encerrado não ocupa).
- **Por quê:** regra do dono (15/09/2026).
- **Exceções:** a sobra não tem essa trava — retalho se acha pela etiqueta. O que já estava duplicado antes da regra não é recusado: vira checagem no painel gerencial.
- **Teste que trava:** `tecido/teste/endereco_unico.test.js`.
- **Status:** no ar desde 15/09/2026.

### R-SME-03 · Não há emenda, e a peça larga demais vira número de compra
- **Regra:** peça mais larga que toda bobina do estoque não sai; o plano devolve `falta_bobina` com quantas peças, de que largura e qual a maior que existe hoje.
- **Por quê:** sem isso a venda parada morre numa linha de texto e quem compra tecido nunca fica sabendo.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/falta_bobina.test.js`.
- **Status:** no ar.

### R-SME-04 · Não há ourela
- **Regra:** a largura cadastrada é a largura útil do rolo, e não há desconto automático.
- **Por quê:** confirmado em 03/09/2026. Se um dia houver ourela, o caminho é cadastrar a largura útil.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste** — é a ausência de uma conta, não uma conta.
- **Status:** confirmado em 03/09/2026.

---

## Custo, giro e o painel gerencial

### R-SMC-01 · O preço do rolo é congelado na compra, e não há tabela de preço
- **Regra:** o preço mora em `rolo.preco_m2`, gravado na entrada. O que pré-preenche a próxima entrada é o último preço realmente pago (`custo.ultimoPreco`). `tecido/dominio/custo.js` é o dono único de "quanto vale".
- **Por quê:** preço no cadastro do fornecedor, multiplicado na hora de mostrar, faz o estoque comprado antes mudar de valor no dia do reajuste — e ninguém percebe, porque o número só fica maior.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/custo.test.js`.
- **Status:** no ar desde 03/09/2026.
- **História:** armadilha #15.

### R-SMC-02 · Custo sem preço é piso; sem `custo.ver` o valor não viaja; parado é tempo sem sair
- **Regra:** rolo sem nota lançada não soma zero: o total sai como **piso** (`≥`). Quem não tem `custo.ver` não recebe os campos de dinheiro no JSON — a poda é por **padrão de nome** (`preco|valor|custo|nf|fornecedor`), nunca por lista. "Parado" é tempo sem sair, não idade.
- **Por quê:** são as regras do PCP (§7-B e §18) valendo aqui igual. Lista de nomes envelhece e deixa campo novo viajar até a bancada.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/custo.test.js` · `tecido/teste/acesso_operador.test.js`.
- **Status:** no ar.
- **História:** armadilha #15.

### R-SMC-03 · A média não divide por uma janela maior que a história
- **Regra:** `giro.janela()` corta a janela pedida no primeiro consumo registrado, e a tela escreve em âmbar quando a janela usada difere da pedida. Saída de tecido é `motivo='consumo'` e só — `ajuste` e `encerramento` não são corte. Sem consumo, a cobertura é `null`. `tecido/dominio/giro.js` é o dono único de "quanto consumiu".
- **Por quê:** 12 dias de história ÷ 30 dá um número 2,5× menor que a verdade, com cara de fato — o comprador compra para 4 m²/dia e a fábrica gasta 10.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/giro.test.js`.
- **Status:** no ar.
- **História:** armadilha #16.

### R-SMC-04 · O painel gerencial é por tecido × largura de bobina, e a cobertura do conjunto só olha o que gira
- **Regra:** o grão é tecido × largura de bobina, e todo consolidado é soma desse grão. A fonte de consumo é `movimento_rolo`, não `plano.consumo_m2` (que soma sobra também). A cobertura do conjunto **não** põe o estoque parado no numerador. O mínimo sai de `estMinDias` e `estMinSeguranca` (a margem nasce zero). `tecido/dominio/gerencial.js` é o dono de mínimo, status e faixas, e compõe o `giro.js` e o `custo.js`.
- **Por quê:** não há emenda, então somar as bobinas esconde justamente a que vai faltar. Com o parado no numerador a cobertura dobra porque há dinheiro dormindo (237 dias contra 138 na validação real).
- **Exceções:** na conta de **compra** do comprometido (fase 4-B) somar as bobinas é legítimo: a pergunta é quanto comprar, não se aquela bobina aguenta.
- **Teste que trava:** `tecido/teste/gerencial.test.js`.
- **Status:** no ar.
- **História:** armadilha #17.

---

## O catálogo e a persiana (fase 1)

### R-SMV-01 · `persiana.js` é o dono único de "o que esta persiana é"
- **Regra:** `tecido/dominio/persiana.js` responde o degrau da escada de tubos, os componentes com medida de corte **e** de consumo, o kit, o preço, os avisos e as recusas. O simulador, o pedido, a ficha congelada na aprovação e a etiqueta chamam essa função.
- **Por quê:** uma segunda conta faria a bancada cortar por uma régua e o cliente ser cobrado por outra (armadilha #12).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/persiana.test.js`.
- **Status:** no ar e conferida na fábrica em 22/09/2026: dez persianas reais do WhatsApp bateram no corte e depois no preço.

### R-SMV-02 · Milímetro e centavo inteiros por dentro; a porta é o `nucleo/unidade.js`
- **Regra:** medida em milímetro inteiro e dinheiro em centavo inteiro; metro com três casas e reais só por fora, convertidos pelo `tecido/nucleo/unidade.js`. A tela nunca converte com `Number(x)*1000`.
- **Por quê:** a conta da ficha empilha (o tubo tira do final, o tecido tira do tubo, a base soma no tecido) e o ruído de ponto flutuante compõe. `1,007 × 1000` dá 1006,9999… e o servidor recusa a medida certa.
- **Exceções:** o estoque de tecido (`rolo`, `sobra`) continua em metro `REAL`, e ali está certo.
- **Teste que trava:** `tecido/teste/persiana.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMV-03 · A ficha tem os dois números por linha, e consumo e corte nunca se misturam
- **Regra:** a medida de corte vai para a etiqueta; a de consumo vai para Compras e para o custo. Dobrar a medida de corte não muda um centavo.
- **Por quê:** é a armadilha #18 do PCP (§7-B): precificar pelo corte não paga o desperdício, e cortar pelo consumo faz a peça não entrar.
- **Exceções:** na fase 1 o consumo nasce igual ao corte.
- **Teste que trava:** `tecido/teste/persiana.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMV-04 · A coleção de venda aponta para o cadastro de tecido, e o modelo não guarda linha
- **Regra:** coleção, cor e tecido não se duplicam para a venda — a coleção aponta para o cadastro de tecido. A linha já está dentro da coleção (pela `abertura`), e o modelo não a guarda.
- **Por quê:** a segunda afirmação sobre o mesmo fato diverge no primeiro dia em que alguém editar só uma.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/catalogo_sm.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMV-05 · O tubo sai da escada, e cada aviso e recusa diz por quê
- **Regra:** o tubo só se escolhe pela escada de degraus, e degrau que não sobe nos dois limites é recusado no cadastro. Tirar o bandô, pôr a redução de peso ou recusar a medida vêm sempre com a frase do motivo.
- **Por quê:** degrau que não sobe faz a persiana pular o tubo em silêncio. A frase é parte da regra, não texto de erro.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/catalogo_sm.test.js` · `tecido/teste/persiana.test.js`.
- **Status:** no ar desde 22/09/2026.

---

## A revenda, o preço e o prazo (fase 2)

### R-SMR-01 · O preço da revenda sai do subtotal Deccorar em cascata, arredondado uma vez, e o subtotal não se mexe
- **Regra:** `subtotal Deccorar × (1 − tabela A/B/C) × (1 − desconto da revenda)`, em cascata e nunca somados; a conta é feita em inteiro e só divide no fim. O **subtotal Deccorar** fica intocado e aparece junto com o que a revenda paga, nunca um no lugar do outro.
- **Por quê:** decisão do dono (22/09/2026). Somados, dois percentuais grandes zerariam a venda sem ninguém notar; dois arredondamentos erram um centavo que a revenda confere. O subtotal vai para faturamento, Compras, crédito e relatório.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/persiana.test.js` (reintroduzir o arredondamento por degrau reprova).
- **Status:** no ar desde 22/09/2026.

### R-SMR-02 · Tabela sem percentual é recusa com o nome do que falta, e nasce vazia, não zero
- **Regra:** as tabelas A/B/C nascem `NULL`. Sem o percentual lançado, a tela escreve *"falta lançar: tabela B"* — não mostra piso.
- **Por quê:** zero é "sem desconto", que é decisão; vazio é "ainda não se sabe". E desconto só faz o número descer: o subtotal seria um **teto**, e `≥` diria a coisa errada.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/revenda.test.js` · `tecido/teste/persiana.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMR-03 · O prazo é conta do `prazo.js`, pela hora do ENVIO
- **Regra:** enviado até quarta 18:00 fica pronto na quinta da semana seguinte; entrega em dia não útil empurra e diz qual feriado empurrou. Os quatro números são parâmetros (fora da faixa é recusado) e os feriados são cadastro. `calcular` recebe o momento do envio; o prazo congelado não se recalcula. A tela mostra a prévia ("um pedido enviado agora fica pronto quando?").
- **Por quê:** a demora da aprovação é da Deccorar e não pode passar para a revenda; recalcular com o relógio de hoje daria outra data ao mesmo pedido.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/prazo.test.js` (os casos saem das datas da §4.9 da spec).
- **Status:** no ar desde 22/09/2026.

### R-SMR-04 · O vendedor tem área própria, `sobmedida.vender` é `operacao`, e não edita revenda nem crédito
- **Regra:** a área "Sob medida — venda" dá o papel `vendedor` (simulador, catálogo de leitura, a carteira dele). A chave é `nivel:'operacao'`. O papel tem `custo.ver` e `modulo.entrar`, e **não** tem `revenda.editar` nem `credito.editar`.
- **Por quê:** declarada como admin, a área `'admin'` viraria **diretor** no portão e devolveria o módulo inteiro (porta A da #28). Sem `custo.ver` o simulador chegaria sem o preço; sem `modulo.entrar` o módulo abriria em branco. Tabela, desconto e limite são decisão de quem responde pelo dinheiro.
- **Exceções:** as outras 23 chaves de nível admin do PCP continuam entrando como diretor (R-SMA-02).
- **Teste que trava:** `teste_acesso.js` (seção 6-B, confere o nível declarado) · `tecido/teste/acesso_operador.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMR-05 · O vendedor é gente do PCP, e a porta de pessoas só deixa passar id e nome
- **Regra:** a revenda guarda `vendedor_usuario_id` e `vendedor_nome` como retrato. A lista chega por `nucleo/pessoas.js`, ligado no `server.js`, que remapeia para `id` e `nome`. Sem a porta ligada, recusa dizendo onde se liga — nunca lista vazia.
- **Por quê:** dois cadastros de gente são dois lugares para lembrar de desligar alguém. Lista vazia em silêncio faria alguém procurar no lugar errado.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/revenda.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMR-06 · Campo de dinheiro tem nome do padrão de poda
- **Regra:** todo dinheiro do módulo se chama `preco_*` ou `valor_*` (ex.: `valor_limite_credito_centavos`).
- **Por quê:** a poda do `custo.js` corta por nome; um `limite_credito_centavos` ou `total_centavos` viajaria pelo fio para quem não tem `custo.ver`.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/revenda.test.js` (trava o nome certo e o errado).
- **Status:** no ar.

---

## O pedido (fase 3)

### R-SMP-01 · Congelado é congelado: preço no envio, ficha na aprovação
- **Regra:** depois do **envio** nenhuma leitura volta ao catálogo nem ao cadastro da revenda; depois da **aprovação** nem a ficha se relê — na bancada vence a etiqueta. O tubo que muda entre envio e aprovação grava linha em `sm_pedido_alteracao`.
- **Por quê:** um reajuste de terça não pode mexer no que foi vendido na segunda (armadilha #15 pela porta da venda).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js` (reajustar depois do envio reprova três casos).
- **Status:** no ar e conferido em produção em 23/09/2026 (pedido 5001, com a folha na mão) · a semana em paralelo ao Decorsoft ainda não aconteceu.
- **História:** "A fase 3".

### R-SMP-02 · Aprovado não se altera, nem pelo admin: corrige-se cancelando a peça
- **Regra:** a peça errada sai **cancelada**, com motivo e quem, e fica na lista; outra é lançada.
- **Por quê:** decisão de 22/09/2026 (`DECISOES.md`). A marca "até a primeira etiqueta" seria regra inerte (dívida 18); sumir de uma lista impressa vira discussão.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMP-03 · O número nasce no envio, nunca volta ao bolo e nunca desce
- **Regra:** orçamento (rascunho) não tem número e o preço dele é o de hoje, lido ao vivo — nada de preço gravado no rascunho. O envio é recusado sem `pedidoNumeroInicial` lançado. O enviado volta a rascunho mantendo o número; depois do primeiro número a peça sai cancelada, nunca apagada. A numeração é o maior entre o parâmetro e o já usado.
- **Por quê:** o plano de corte agrupa o tom único pelo texto do pedido e olha para trás: um 4272 novo colado num do Decorsoft herdaria o tom de outro cliente. Número que volta ao bolo sai duas vezes.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMP-04 · A cor do tecido é obrigatória no pedido, e o `tecido_id` é gravado no lançamento
- **Regra:** o pedido não aceita item sem cor; o `tecido_id` resolvido pelo `persiana.js` é gravado, nunca reencontrado pelo nome. A lista de cores tem porta própria (`GET /api/sm/colecoes/:id/cores`, `catalogo.ler`) e só traz cor com tecido cadastrado.
- **Por quê:** a cor decide qual rolo sai da prateleira. Mandar o vendedor a `/api/cadastros` daria 403 com seletor vazio.
- **Exceções:** no simulador a cor é opcional.
- **Teste que trava:** `tecido/teste/pedido.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMP-05 · "Sem tecido" é sinal, nunca trava
- **Regra:** o pedido de tecido que não está na estante entra, marcado, e o vendedor negocia prazo.
- **Por quê:** travar é a armadilha #6: a venda existe, e quem é recusado vende por fora.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js` (caso 4.10).
- **Status:** no ar e conferido em 23/09/2026 (a peça fora da estante entrou marcada).

### R-SMP-06 · O total é a soma das peças de pé, arredondadas na peça, e as linhas de preço ficam gravadas
- **Regra:** cada peça arredonda uma vez; o total soma as peças ativas; a coluna do pedido guarda o que o envio prometeu, e os dois aparecem lado a lado quando divergem. As linhas de preço moram em `sm_pedido_item_preco`. Pedido sem peça não mostra `R$ 0,00`.
- **Por quê:** a folha impressa tem que fechar com as parcelas dela; a conferência da revenda é que acha o erro de medida antes do corte.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js`. ⚠ O `R$ 0,00` do pedido vazio é de tela e **não tem teste**.
- **Status:** no ar e conferido em 23/09/2026 (`530,29 + 251,75 = 782,04` refeito contra o papel).

### R-SMP-07 · Rascunho não vira papel, e o PDF higieniza o texto
- **Regra:** `GET /api/pedidos/:id/pdf` recusa o que não foi enviado. O texto passa por um higienizador (Helvetica é WinAnsi): o caractere que a fonte não tem vira `?`.
- **Por quê:** impresso, o preço de hoje vira compromisso que o sistema não assumiu. Emoji do WhatsApp derrubava a geração no meio.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js` (tirar o higienizador reprova).
- **Status:** no ar desde 22/09/2026.

### R-SMP-08 · Aprovar é duas chaves, e a fila conta dias de fábrica
- **Regra:** `pedido.aprovar` (a carteira dele) e `pedido.aprovar_qualquer` (de qualquer um, para férias). A rota de aprovar pede a **estreita**. `pedido.cancelar` não é do vendedor. A fila mostra `dias_uteis_restantes` pelo `prazo.diasUteis`, e negativo fica negativo.
- **Por quê:** a chave larga na rota tiraria do vendedor a própria fila. Três dias com feriado e fim de semana podem ser zero dias de trabalho; vencido é o que a lista existe para mostrar.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/acesso_operador.test.js` · `tecido/teste/pedido.test.js`.
- **Status:** no ar desde 22/09/2026.

---

## A etiqueta de produção (fase 4-A)

### R-SMT-01 · O código é da peça e nasce na aprovação
- **Regra:** cada componente que gera etiqueta ganha `SER-000123`, `COL-…`, `MON-…`, `REV-…`, `EMB-…` na mesma transação da ficha congelada. `atribuirCodigos` é idempotente; o `backfill_etiquetas.js` usa o mesmo caminho (com `await db.backup()`).
- **Por quê:** código novo a cada papel partiria a história da peça; código reaproveitado sairia em duas peças, e a bancada bipa a peça errada com a etiqueta certa.
- **Exceções:** os kits não geram etiqueta. São 6 etiquetas na persiana lisa e 7 com adicional (bandô e barra nunca convivem).
- **Teste que trava:** `tecido/teste/etiqueta_producao.test.js`.
- **Status:** no ar e conferido no papel em 23/09/2026 (o leitor da bancada bipou) · a medida escrita contra o tubo na mão ainda não.

### R-SMT-02 · Um contador por setor, que sobe num `UPDATE … RETURNING` e nunca devolve número
- **Regra:** cada setor conta o seu; o número sobe numa instrução só, com `UNIQUE` em `codigo_etiqueta` como segunda tranca; nem cancelamento nem backfill devolvem número.
- **Por quê:** `SELECT` + `UPDATE` separados dão o mesmo código a duas aprovações; um contador só faria o serralheiro ver saltos de dezenas.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/etiqueta_producao.test.js`.
- **Status:** no ar desde 23/09/2026.

### R-SMT-03 · O que vai escrito é a medida de CORTE, e no tubo o nome é o degrau
- **Regra:** a etiqueta e a lista do corte escrevem a medida de corte (`0,970`, não `1,000`); no tubo sai `TUBO 32 · CORTAR 0,970`. `POST /api/producao/para-cortar` devolve as peças em medida de corte, agrupadas por tecido.
- **Por quê:** armadilha #18 na bancada; Tubo 32 e Tubo 41 são peças diferentes.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/etiqueta_producao.test.js`.
- **Status:** no ar desde 23/09/2026.

### R-SMT-04 · Reimprimir sai com o mesmo código, e o aviso vem antes do botão
- **Regra:** a reimpressão grava `reimpressoes` e uma linha em `sm_etiqueta_impressao` — história, não peça. A tela avisa antes do clique e manda jogar o maço anterior fora. Só sai etiqueta de pedido aprovado e com código.
- **Por quê:** armadilha #1-B pela porta da produção. Depois do clique o aviso explicaria um maço que já saiu.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/etiqueta_producao.test.js`.
- **Status:** no ar desde 23/09/2026.

### R-SMT-05 · `etiqueta_producao.imprimir` não é `etiqueta_producao.ler`
- **Regra:** ler a lista é do vendedor também; imprimir é de quem corta.
- **Por quê:** o mesmo arranjo do `kit.imprimir` × `kit.editar` (§4).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/acesso_operador.test.js`.
- **Status:** no ar desde 23/09/2026.

### R-SMT-06 · O papel tem um desenho só, e o CODE128 é o `public/barras.js`
- **Regra:** a página é 100 × 35 mm; o código de barras ocupa a faixa inteira do rodapé (66 mm), com o código e o setor escritos à direita. A tabela CODE128 é a do `public/barras.js`, exportada pelo `etiqueta_pdf.js`.
- **Por quê:** numa coluna de 38 mm o módulo cai a 0,23 mm e a ZD220 não resolve na etiqueta amassada. Duas tabelas CODE128 são duas etiquetas no dia em que uma mudar.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/etiqueta_producao.test.js` (a página lida pelo `PDFDocument`).
- **Status:** no ar e conferido no papel em 23/09/2026.

---

## O que ainda não tem teste nas partes 1 e 2

R-SMM-01 (o try/catch que protege a expedição), R-SMD-01 (a paleta igual à do
PCP), R-SME-04 (sem ourela) e a parte de tela da R-SMP-06 (o pedido sem peça não
mostra `R$ 0,00`).
