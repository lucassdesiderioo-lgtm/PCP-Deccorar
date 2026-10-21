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
> [`tecido/README.md`](../../tecido/README.md). Passado para cá em quatro
> partes (21/10/2026): o módulo, o acesso, o design e a estante de tecido; o
> catálogo, a revenda, o pedido e a etiqueta de produção; o consumo, a compra,
> os setores, o bipe, a recusa, o quadro e os indicadores; e o financeiro, as
> telas e o corte em etapas.

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

## O consumo e a compra (fases 4-B e 4-C)

### R-SMU-01 · O comprometido de tecido é conta do `consumo.js`, e lê o CONSUMO, nunca o corte
- **Regra:** "quanto já está vendido e ainda não foi cortado" sai só do `dominio/consumo.js`; o `gerencial.js` compõe giro e consumo e não calcula nenhum. Só pedido **aprovado** compromete; peça cancelada sai. A medida lida é a de consumo da ficha congelada.
- **Por quê:** a medida de corte é a mais apertada, e comprar por ela compra a menos (armadilha #18). Duas contas do mesmo número divergem no dia da compra (#12).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/consumo.test.js` (dobrar a medida de corte não mexe no comprometido).
- **Status:** no ar desde 24/09/2026.
- **História:** "A fase 4-B".

### R-SMU-02 · O comprometido baixa no corte confirmado, peça a peça
- **Regra:** quem baixa é o plano **confirmado** (o corte feito); plano só calculado não baixa nada. O casamento é exato por `(pedido, tecido, medida de corte)`, e a irmã não cortada continua na conta.
- **Por quê:** número que só sobe vira número que a equipe aprende a ignorar.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/consumo.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMU-03 · O comprometido não se reparte entre bobinas, e o tecido sem rolo aparece
- **Regra:** o comprometido tem lista própria por tecido (`por_tecido`), fora da tabela tecido × largura. Tecido com venda aprovada e nenhum rolo aparece no painel, com **traço** na estante, nunca `0 m²`. O filtro da tela corta o cartão e a tabela juntos.
- **Por quê:** o pedido escolhe a cor; a largura é o plano que escolhe, na hora de cortar (armadilha #17). Zero se lê como "tinha e acabou", e a verdade é "nunca teve".
- **Exceções:** na conta de **compra** somar as bobinas é legítimo; na de cobertura, não.
- **Teste que trava:** `tecido/teste/consumo.test.js` (repartição, tecido sem rolo, filtro). ⚠ O traço no lugar do `0 m²` é de tela e **não tem teste**.
- **Status:** no ar desde 24/09/2026.

### R-SMU-04 · O "sem tecido" do envio é foto; o aviso ao vendedor é de hoje, e os dois ficam
- **Regra:** a marca gravada no envio continua; o card **Aprovados esperando tecido** olha a estante agora. O pedido entra inteiro no aviso, e a linha diz o que **este** pedido usa, com o total do tecido nomeado embaixo.
- **Por quê:** a foto explica o prazo que a revenda já ouviu; o rolo pode ter chegado ou ter sido comido por outro pedido. Escrever o total do tecido em cada pedido faria quem soma comprar o dobro.
- **Exceções:** pedido com tecido de sobra não entra no aviso.
- **Teste que trava:** `tecido/teste/consumo.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMU-05 · O tecido do sob medida não vai ao Compras do PCP; o tubo vai, e é um só
- **Regra:** o tecido tem painel, mínimo e status no `tecido.db` e fica lá. O tubo é o mesmo material da medida padrão e entra no Compras do PCP (`sobmedida_material.js` → `necessidade_dominio.js`), somando no mesmo componente, com a origem em `origem_sobmedida` (por pedido), nunca em `origem` (por SKU).
- **Por quê:** decisão do dono, 24/09/2026 — "é o mesmo tubo, e o compras deveria ser o mesmo". Comprar em dois lugares compra duas vezes; quem chega por último apagaria o outro e a fábrica compraria metade.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_compras_sobmedida.js` · `tecido/teste/material_compra.test.js`.
- **Status:** no ar desde 24/09/2026 · os quatro degraus estão apontados (Tubo 32, 38, 41 e 56) · a primeira compra pela lista ainda não foi conferida na fábrica.
- **História:** "A fase 4-C".

### R-SMU-06 · A peça sai da conta de compra quando a etiqueta do próprio tubo é impressa
- **Regra:** a linha do tubo sai quando ela é impressa (`impresso_em`); imprimir o maço da Coleção não baixa o tubo, e a irmã não impressa continua. Reimprimir não muda nada. Pedido só enviado não conta.
- **Por quê:** o pedido para em `aprovado`, e sem sinal de saída o número só subiria. O custo assumido: o maço impresso e ainda não cortado conta como produzido (horas, não dias).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/material_compra.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMU-07 · O tubo se aponta no degrau, o resto no componente, e quem converte é a unidade do PCP
- **Regra:** o componente recusa a chave `tubo` e manda à escada. Não há fator digitado: em `m` lê-se a medida de **consumo**, em `un` contam-se peças. O cadastro recusa unidade que a peça não sabe dizer (kg), material em metro em peça sem medida de consumo ou medida por largura **e** altura, e componente que não gera etiqueta.
- **Por quê:** Tubo 32 e Tubo 41 são itens diferentes. Um multiplicador digitado é a segunda régua que erra em silêncio; cada recusa evita um número que mente.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/material_compra.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMU-08 · O que falta vira pendência, nunca zero, e a lista de compras não cala
- **Regra:** degrau sem material apontado, material apagado e degrau renomeado depois do pedido viram **pendência** com o nome e o pedido. Os outros componentes não cobram vínculo. Unidade divergente entre os dois lados vira pendência dizendo as duas. Sem a porta do sob medida, a lista de compras do PCP **diz** que ele ficou de fora, com o motivo — não recusa e não cala; a porta de ida (`nucleo/materiais.js`) sem ligação recusa, nunca lista vazia. A tela agrupa a pendência pelo motivo.
- **Por quê:** uma persiana sempre tem tubo, então ele faltar é buraco na lista (regra 4 do custo). Cobrar vínculo de mão de obra seria a armadilha #6. Recusar a lista inteira deixaria o comprador sem lista por causa do outro módulo.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/material_compra.test.js` · `teste_compras_sobmedida.js` (tirar o try/catch reprova três casos).
- **Status:** no ar desde 24/09/2026.

---

## Os setores da produção (fase 5-A)

### R-SMS-01 · São cinco chaves de setor, de nível `operacao`, e os setores nascem vazios
- **Regra:** Serralheria, Coleção, Montagem, Revisão e Embalagem são cinco setores `Sob medida / …`, cada um só com a chave dele, sem ninguém migrado. As chaves são `operacao`, nunca `admin`.
- **Por quê:** o bipe grava quem fez, e uma chave só faria a recusa acusar a pessoa errada. Nível admin vira **diretor** no portão do módulo (a porta A da #28). O prefixo separa "Revisão" e "Embalagem" dos setores de mesmo nome da medida padrão.
- **Exceções:** na tela de Acessos eles saem em ordem alfabética; a ordem da fábrica é o `SETORES` do `tecido/nucleo/acesso.js`.
- **Teste que trava:** `teste_acesso.js` (seção 6-C) · `tecido/teste/acesso.test.js`.
- **Status:** no ar desde 24/09/2026 · a regra só pega quando alguém é marcado num dos cinco (armadilha #30); a marcação não foi conferida aqui.
- **História:** "A fase 5-A".

### R-SMS-02 · Setor é cadastro, chave é código
- **Regra:** nome, ordem e prefixo da etiqueta se editam em `sm_setor`; um sexto setor de produção exige chave nova no `permissoes.js`. A permissão nunca é gerada a partir do `tecido.db`.
- **Por quê:** gerar a chave do banco do sob medida acoplaria os dois bancos e furaria a porta única. Setor novo é mudança de como a fábrica trabalha.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste** — nada impede alguém de gerar chave a partir do cadastro.
- **Status:** no ar desde 24/09/2026.

### R-SMS-03 · Papel e setores são duas contas, e a bancada vem do setor
- **Regra:** `papelDe()` dá um papel só (a área mais larga); `setoresDe()` dá todas as áreas de setor. `producao.bipar` vem do setor, e quem não tem setor não a tem. O diretor bipa os cinco.
- **Por quê:** derivar uma conta da outra daria 403 na bancada ao vendedor que também embala, com a caixinha marcada. Recusar o dono na bancada seria a armadilha #6.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/acesso.test.js` · `tecido/teste/producao.test.js` · `teste_acesso.js` (seção 6-C).
- **Status:** no ar desde 24/09/2026.

---

## O bipe da bancada (fase 5-B1)

### R-SMB-01 · As liberações são dado, e só segura quem existe e gera etiqueta
- **Regra:** a tabela `ANTES` diz o que libera o quê: tubo, base e tecido seguram a montagem; bandô e barra seguram **só** a embalagem. Componente que a persiana não leva, ou que não gera etiqueta (a redução de peso), não segura ninguém. A fila vem na ordem do prazo e diz o que fazer, na medida de corte.
- **Por quê:** cadeia de `if` esconde a regra; bandô na montagem pararia a linha por uma peça que só vai na caixa; componente sem bipe nunca termina.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/producao.test.js`.
- **Status:** no ar desde 24/09/2026 · rodado na tela com uma persiana lisa e uma com bandô · a bancada de verdade ainda não.
- **História:** "A fase 5-B1".

### R-SMB-02 · O pronto é `pronto_em`, e o `marco` não muda
- **Regra:** o pedido fica pronto quando a última persiana é embalada; grava `pronto_em` e uma linha em `sm_pedido_marco`. O `marco` continua `aprovado`. O kit não conta no pronto; peça cancelada não segura.
- **Por quê:** três lugares filtram `marco='aprovado'` — a reimpressão da etiqueta e as duas contas do comprometido e do material. Cada persiana tem duas linhas de embalagem, e a do kit nunca termina.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/producao.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMB-03 · Um campo e um bipe: o primeiro inicia, o segundo termina; na embalagem o kit é o do tipo certo
- **Regra:** o bipe grava quem; bipar o que já terminou é recusado dizendo quem fez. Na embalagem são três bipes (início · kit · fim): o kit errado é recusado dizendo qual é o certo, e kit sem código cadastrado é recusa, nunca "passou". Só a embalagem cobra kit.
- **Por quê:** dois botões são uma escolha a mais para quem está de luva. O kit prova que entrou o **certo**; não é o `public/kit_bipe.js` do PCP, que responde outra pergunta.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/producao.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMB-04 · Bipar o que não está liberado responde o que segura, com o nome do setor
- **Regra:** a recusa diz a peça, o setor (pelo **nome**, nunca a chave do banco), quem está com ela e desde quando, e lista tudo que segura. Quem não é do setor não bipa a bancada do outro.
- **Por quê:** "não aparece" vira "ninguém sabe por quê", e a equipe para de usar a tela. Chave de banco em tela é o "— Correcao de contagem" do §2.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/producao.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMB-05 · A pendência se fecha com `producao.pendencia` e com motivo
- **Regra:** a peça dada como feita sem o bipe de quem fez é fechada por quem tem `producao.pendencia` (o diretor, pelo `*`), com motivo; o fechamento grava quem, quando e por quê. A bancada não fecha a própria.
- **Por quê:** se quem bipa fechasse a própria, a trava deixaria de existir; fechamento sem porquê não é rastro.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/producao.test.js`.
- **Status:** no ar desde 24/09/2026.

---

## A recusa e o refazer (fase 5-B2)

### R-SMX-01 · O motivo aponta o componente, e volta o culpado e o que depende dele
- **Regra:** cada motivo (`sm_motivo_producao`) aponta um **componente**, e o setor sai dele. Recusar reabre o culpado e tudo que foi feito em cima dele, pelo mesmo `ANTES` lido ao contrário — nem mais, nem menos. O bandô recusado não derruba a montagem.
- **Por quê:** a serralheria faz quatro peças, e mandar "para a serralheria" refaria as quatro (armadilha #6). Uma segunda tabela de "o que vem antes" divergiria no dia em que o fluxo mudasse (#12).
- **Exceções:** diverge da letra da §4.16 da spec ("Tubo maior → Serralheria"), anotado lá.
- **Teste que trava:** `tecido/teste/recusa.test.js`.
- **Status:** no ar desde 24/09/2026 · rodado na tela · a bancada de verdade recusando uma peça ainda não.
- **História:** "A fase 5-B2".

### R-SMX-02 · Só se recusa o trabalho anterior que existe e já terminou
- **Regra:** recusar é `producao.bipar`. É recusado: o próprio trabalho, o que vem depois, a peça que esta persiana não leva, o culpado que ainda não terminou, a peça cancelada e quem não está naquela bancada. A tela só oferece os motivos que passam, e a lista vazia diz qual das três razões a esvaziou.
- **Por quê:** quem está com a peça na mão é a bancada; o que impede o abuso é o rastro. Escolha que só serve para dar erro é a armadilha #6 dentro de uma lista.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/recusa.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMX-03 · `refeitas` conta a peça física, e a `sm_recusa` guarda o retrato
- **Regra:** `refeitas` sobe só no culpado. A `sm_recusa` grava quem tinha feito, quem recusou, de onde e o nome do motivo daquele dia. A reabertura limpa o `kit_conferido_em` e desfaz o `pronto_em`; o `marco` não se mexe, e a linha `pronto` do histórico fica. A recusa que falha no meio não grava metade.
- **Por quê:** a reabertura apaga o bipe do culpado, que é o dado do indicador; sem limpar o kit, a refeita fecharia a caixa sem o terceiro bipe.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/recusa.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMX-04 · A refeita reimprime por código, com o mesmo código e a marca vermelha
- **Regra:** a reimpressão é da peça, não do maço do pedido; sai com o mesmo código e `REFAZER Nª VEZ` em vermelho. A peça volta marcada na fila, e o card **Refazer** da Produção lista só ela.
- **Por quê:** o maço inteiro deixaria etiquetas repetidas na bancada; sem a marca, duas etiquetas iguais e nada dizendo qual é a boa.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/recusa.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMX-05 · O cadastro de motivos nasce cheio, e não se mistura com o do corte
- **Regra:** a `sm_motivo_producao` nasce com os oito motivos da spec; a lista edita, acrescenta e desativa, e motivo com recusa atrás não se apaga. A bancada lê só os ativos. Ela não é a `motivo_recusa` do plano de corte.
- **Por quê:** tabela vazia faria o botão "Recusar" abrir uma lista sem nada (dívida 18). Juntar os dois cadastros estragaria os relatórios dos dois.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/recusa.test.js` (só os ativos; motivo sem nome ou de peça sem etiqueta é recusado). ⚠ Os oito semeados, a exclusão recusada com história e a separação dos dois cadastros **não têm teste**.
- **Status:** no ar desde 24/09/2026.

---

## O quadro (fase 6-A)

### R-SMQ-01 · A etapa é derivada, nunca gravada, e o quadro só lê
- **Regra:** a etapa sai de `marco` + `pronto_em` + os bipes; não há coluna `etapa` no `sm_pedido`. O `marco` não virou `pronto`. Cancelado vence todas as outras.
- **Por quê:** coluna gravada divergiria do `pronto_em` no primeiro bipe (#12); trocar o marco mudaria em silêncio os números da compra.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js`.
- **Status:** no ar desde 24/09/2026.
- **História:** "A fase 6-A".

### R-SMQ-02 · As colunas são livres, as etapas não
- **Regra:** o nome é cadastro (`sm_kanban_coluna`); a etapa é a lista fechada do `dominio/kanban.js`: `edicao`, `enviado`, `aprovado`, `producao`, `pronto` e `cancelado`. Etapa que não existe é recusada dizendo quais existem; duas colunas na mesma etapa são recusadas; renomear não mexe na etapa. Não há `entregue`.
- **Por quê:** renomear "Em produção" não pode desligar nada. O mesmo pedido em dois lugares faz desconfiar da tela inteira. Coluna que nunca recebe cartão é paisagem (dívida 18).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMQ-03 · Pedido não some do quadro, e etapa sem pedido não vira aviso
- **Regra:** desativar a coluna faz o pedido virar **aviso** no topo, com a etapa nomeada e a contagem; reativar devolve os cartões.
- **Por quê:** o quadro responde "onde está o pedido X". Aviso que aparece todo dia sem nada atrás é paisagem.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMQ-04 · A barrinha não conta o kit nem a cancelada, e não existe antes da aprovação
- **Regra:** a barrinha conta o que falta por setor, sem o kit e sem peça cancelada; pedido sem ficha (antes da aprovação) não tem barrinha.
- **Por quê:** o kit nunca termina; a cancelada não é trabalho; barrinha zerada antes da ficha diria "nada foi feito" em vez de "ainda não há o que fazer".
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMQ-05 · O quadro é `painel.ler`, e cartão sem valor não vale `R$ 0,00`
- **Regra:** o quadro é a fábrica toda com o valor de cada carteira, e pede `painel.ler`, nunca `pedido.ler`. O cartão sem valor lançado não mostra valor, e o total da coluna vira piso (`≥`). Cartão cancelado não leva selo de retido.
- **Por quê:** o vendedor tem `pedido.ler`. Zero se lê como "de graça" (regra 4 do custo).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js`.
- **Status:** no ar desde 24/09/2026.

---

## Os indicadores (fase 6-B)

### R-SMI-01 · A régua do bipe suspeito é uma só, e o limite é cadastro
- **Regra:** `marcarSuspeitos` roda uma vez sobre a lista de bipes, e horas-homem, tempo por m² e produtividade leem a marca. Pega o bipe aberto **e** o que fechou acima de `bipeAbertoMaxHoras`. O parâmetro nasce em 2 h (chutado) e é recusado em zero, negativo ou acima de 24 h. O bipe descartado aparece, com peça, quem e quanto.
- **Por quê:** três filtros seriam três réguas (#12). O exemplo da §4.17 é de um bipe que fechou. Limite zero tornaria todo bipe suspeito.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026 · ainda não conferido pelo dono · depende de a bancada bipar de verdade.
- **História:** "A fase 6-B".

### R-SMI-02 · Número incompleto não vira número certo
- **Regra:** a persiana com bipe descartado, incompleta ou cancelada fica fora da média de tempo e é contada à parte; o kit não entra. A produtividade é a exceção: o grão dela é o bipe.
- **Por quê:** a soma menor puxaria a média para baixo em silêncio (regra 4 do custo); cobrar a persiana inteira mediria uma pessoa pelo trabalho das outras quatro.
- **Exceções:** produtividade, como acima.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMI-03 · O tempo por m² usa o m² real, nunca o cobrado
- **Regra:** o divisor é o m² da peça, nunca o `m2_cobrado_mm2`, que carrega o mínimo faturado de 1,5 m².
- **Por quê:** pelo cobrado a peça pequena pareceria mais rápida do que é (armadilha #18 por outra porta).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMI-04 · Prazo cumprido são dois números, e sem pedido pronto não há porcentagem
- **Regra:** prometido e negociado saem separados; pedido sem `pronto_em` não entra; sem pedido pronto a porcentagem é `null`, nunca `0%`. Prazo vencido fica negativo.
- **Por quê:** somados, o pedido empurrado pareceria entregue em dia. "Cumpriu 0%" seria uma afirmação falsa.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMI-05 · A recusa conta no setor do culpado, e a pessoa é quem tinha feito
- **Regra:** o setor sai do componente culpado, nunca do `recusado_de`; a pessoa é o `feito_por` da `sm_recusa`; o motivo sai com o nome que tinha no dia.
- **Por quê:** contar em quem recusou acusaria quem pegou o erro.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMI-06 · A aprovação é mediana, em tempo corrido, com o maior ao lado
- **Regra:** o tempo de aprovação é a **mediana** em horas corridas, por vendedor, com o maior e os dias de fábrica ao lado; só entra pedido aprovado. Os parados na aprovação são os enviados, fora do filtro de período, com os dias de fábrica restantes.
- **Por quê:** a sexta à noite envenena a média. "Horas úteis" exigiria um cadastro de expediente que não existe. Pedido parado há meses não pode sumir por causa de um recorte.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMI-07 · O vazio diz qual é, e a janela vai escrita
- **Regra:** sem bipe nenhum os blocos dizem "ninguém bipou ainda", e com bipe fora do período mandam mudar o filtro — nunca zero. A janela vem ao lado dos números. A tela é `painel.ler`, numa rota só para as sete perguntas.
- **Por quê:** os dois vazios pedem conselhos opostos (esperar ou mudar o filtro). Sete rotas teriam sete janelas.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`. ⚠ A explicação longa aparecer uma vez só, as datas e a concordância são de tela e **não têm teste**.
- **Status:** no ar desde 26/09/2026.

---

## O financeiro (fases 6-C1, 6-C1b e 6-C1c)

### R-SMF-01 · O disponível é limite menos boletos em aberto, e mostra sem travar
- **Regra:** `disponível = limite − boletos em aberto`. Pedido de revenda estourada entra e é aprovado do mesmo jeito; o que muda é a cor e o selo **crédito estourado** no Quadro. Não há linha no domínio do pedido que leia crédito.
- **Por quê:** decisão do dono, 22/09/2026 — não se perde venda. A trava antes de a baixa ser feita de verdade seria a armadilha #6.
- **Exceções:** cartão cancelado e revenda sem limite não ganham selo.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026 · a baixa de verdade pelo financeiro e o uso semanal pelo vendedor ainda não foram conferidos.
- **História:** "A fase 6-C1".

### R-SMF-02 · Negativo fica negativo, e sem limite o disponível é `null`
- **Regra:** o estourado não é cortado em zero. Sem limite lançado o disponível é `null`, nunca zero.
- **Por quê:** zerar apagaria o tamanho do buraco (o `MAX(0, …)` do §2 pela porta do crédito). Número indefinido não vira número certo (regra 4 do custo).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMF-03 · O título é lançado à mão, e o que conta é a situação derivada
- **Regra:** o boleto nasce no banco e aqui só é lançado; o sistema nunca gera número. A `situacao` sai de `pago_em` e `cancelado_em`: pago e cancelado saem da conta; **vencido fica**, marcado, com o valor vencido à parte. Número repetido na mesma revenda é recusado; em outra revenda passa. Valor e data impossíveis são recusados dizendo o campo.
- **Por quê:** número inventado aqui seria a segunda régua contra o extrato (#12). Tirar o vencido faria o limite de quem não paga parecer mais folgado. Número repetido come o limite em dobro.
- **Exceções:** boleto de revenda inativa continua contando.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMF-04 · A baixa e o cancelamento têm rastro e caminho de volta
- **Regra:** a baixa grava quem e quando; baixar duas vezes é recusado; a baixa se desfaz com motivo. Cancelar exige motivo.
- **Por quê:** sem caminho de volta o jeito vira lançar o título de novo, e a conta dobra. Trava que só acusa é trava que se contorna.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMF-05 · "Aprovado sem boleto" é só de quem paga em boleto, e fica fora do disponível
- **Regra:** a linha "aprovado sem boleto" conta à parte, só para revenda que paga em boleto; PIX e cartão não têm. Enviado, orçamento e cancelado não entram. Não soma no disponível.
- **Por quê:** "nem todo pedido fazemos boleto" (dono, 26/09/2026); aviso no caso normal é a armadilha #6. É compromisso, não dívida — "os dois, mostrados separados".
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMF-06 · O boleto aponta os pedidos que cobre, numa tabela de vínculo
- **Regra:** um boleto cobre N pedidos da mesma revenda, e um pedido aceita N boletos (`sm_boleto_pedido`; a coluna `pedido_id` saiu). Sem pedido nenhum ele nasce **avulso**, derivado, nunca coluna. ID e número de pedido são campos separados (`pedido_ids`, `pedido_numeros`), nunca adivinhados. Um pedido errado, de outra revenda ou cancelado derruba a lista inteira e nada é gravado; o mesmo pedido citado duas vezes conta uma.
- **Por quê:** a coluna única gravava um pedido e esquecia o resto. Números de pedido e ids se cruzam um dia, e o título iria para a venda de outra pessoa.
- **Exceções:** o avulso existe (acerto, frete), e passa marcado.
- **Teste que trava:** `tecido/teste/boleto.test.js` (casos 6-C1b).
- **Status:** no ar desde 26/09/2026.
- **História:** "A fase 6-C1b".

### R-SMF-07 · O título que soma mais que os pedidos avisa quanto, e nunca trava
- **Regra:** só o lado impossível acende: o título maior que os pedidos citados, com a tarja dizendo a diferença em reais. Parcela e avulso não avisam. A soma não usa `COALESCE(…,0)`.
- **Por quê:** o parcelamento nunca "bate", e recusá-lo pararia o caso normal. Aviso binário acendia por vinte centavos de arredondamento.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMF-08 · O pedido está titulado quando os títulos ativos alcançam o valor dele
- **Regra:** a régua é o dinheiro (`TITULADO`, em `dados/boleto.js`, dono único): abaixo do valor o pedido continua cobrável e na lista de marcar, com o que falta. Título que cobre vários pedidos reparte **proporcionalmente**; título que fecha cobre todos sem centavo solto. Cancelado não titula; **pago continua titulando**. A falta é cortada em zero (o lado de cima já tem a tarja da R-SMF-07). O avulso não titula pedido nenhum.
- **Por quê:** com o `NOT EXISTS (vínculo)` a parcela 1 tirava o pedido da lista, e a parcela 2 não tinha onde ser apontada.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js` (casos 6-C1c).
- **Status:** no ar e conferido em 26/09/2026 — o dono lançou a 2ª parcela do mesmo pedido e a falta caiu.
- **História:** "A fase 6-C1c".

### R-SMF-09 · O que falta titular aparece ao lado do em aberto, nunca dentro
- **Regra:** "em aberto" continua sendo só título lançado. "Sem boleto" e "parcialmente titulado" são duas linhas; a do parcial mostra a **falta**, nunca o valor cheio, e as duas dizem "fora do disponível". A linha de um título escreve "cobre R$ X de R$ Y em pedidos", e não "falta".
- **Por quê:** somar a falta mudaria o disponível sem ninguém lançar nada; somar o cheio contaria duas vezes o pedaço já titulado. Título menor é o parcelamento, e quem sabe a falta é a lista.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js` (a mesma régua na lista e na contagem). ⚠ As frases das duas telas **não têm teste**.
- **Status:** no ar desde 26/09/2026.

### R-SMF-10 · A tela do financeiro lista o que marcar, e quem lê é `boleto.ler`
- **Regra:** escolhida a revenda, a tela lista os pedidos com o que falta, pelo **mesmo** critério do crédito, para marcar — nunca para digitar. A rota da lista é `boleto.ler`, nunca `pedido.ler`. `boleto.editar` não está em papel nenhum (só o diretor, pelo `*`). A tarefa semanal vem por prioridade e só com revenda que tem boleto em aberto; a data do último movimento aparece só quando é velha. Todo campo de dinheiro começa com `valor_`, e a marca `estourado` não.
- **Por quê:** digitar é onde nasce o vínculo errado; duas réguas divergem (#12). `pedido.ler` daria um seletor vazio com 403. A poda é por nome.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js` (critério, prioridade, poda, chaves). ⚠ Manter a revenda escolhida depois de lançar e os selos separados no cartão do Quadro **não têm teste**.
- **Status:** no ar desde 26/09/2026.

### R-SMF-11 · NF e entrega não existem, por decisão
- **Regra:** não há coluna `entregue`, selo de NF nem faturamento no sob medida.
- **Por quê:** ninguém marca entrega, e o ERP é outro projeto; coluna que nunca recebe cartão é paisagem (dívida 18). Nasce quando o dono disser quem faz.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js` ("não há etapa de ENTREGUE nem selo de NF").
- **Status:** decisão de 26/09/2026.

---

## As telas do módulo (28 e 29/09/2026)

### R-SML-01 · Dinheiro se escreve com o ponto do milhar, pelo dono único de cada lado
- **Regra:** na tela, o `dinheiro` do `ui.js`; no servidor, o `emReais` do `nucleo/unidade.js`, escrito à mão, **sem `Intl` nem `toLocaleString`**. Os dois saem iguais e são conferidos contra literais em português. Dinheiro sem valor é traço, nunca `R$ 0,00`. Nenhuma tela nova monta `R$ ` à mão; os isentos são nomeados, e o isento zumbi reprova.
- **Por quê:** a mesma revenda saía com o mesmo dinheiro de dois jeitos (#12). Node com ICU pequeno cai em en-US sem dar erro, e a folha da revenda sairia `R$ 4,785.50`.
- **Exceções:** o `emPercentual` fica sem separador.
- **Teste que trava:** `tecido/teste/dinheiro_tela.test.js`.
- **Status:** no ar desde 28/09/2026.
- **História:** "Os dois defeitos de tela do financeiro" e "o separador de milhar … era do servidor".

### R-SML-02 · O que se lê e o que pré-preenche campo são duas funções
- **Regra:** onde a tela mostra dinheiro **e** pré-preenche um campo que volta pelo `paraCentavos`, são duas funções: `reais` (lê, pelo `dinheiro`) e `paraCampo` (sem separador). Vale na ficha da revenda e no catálogo.
- **Por quê:** `4.785,50` no campo vira NaN, e a tela recusaria o valor que ela mesma escreveu.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/dinheiro_tela.test.js`.
- **Status:** no ar desde 28/09/2026 · conferido gravando o campo de verdade.

### R-SML-03 · Toda tabela rola dentro do `window.ui.rolaH(tabela)`, e a página nunca rola de lado
- **Regra:** o `rolaH` recebe a tabela e devolve o recipiente **com ela dentro**; a classe `.rolaH` mora no `base.css`, nunca na tela. Toda tabela do módulo passa por ele — inclusive a que hoje cabe —, sem lista de isentos e sem o padrão de dois passos.
- **Por quê:** `table{width:100%}` não impede a página de andar de lado. O padrão de dois passos deixou um recipiente oco, verde num caso que só olhava a classe.
- **Exceções:** página que rola por um `inline-flex` sem `wrap` (aba Endereços) não é tabela; o conserto é outro.
- **Teste que trava:** `tecido/teste/rola_tela.test.js` (roda a função num DOM de mentira). ⚠ O `inline-flex` sem `wrap` **não tem teste**.
- **Status:** no ar desde 29/09/2026 · medido nas dezesseis telas a 400 e 1440 px · o `/corte` no celular da bancada ainda não foi conferido.
- **História:** "As sete telas que rolavam de lado".

---

## O corte em etapas (spec `CORTE-EM-ETAPAS`, 01/10/2026)

### R-SMK-01 · O estoque só anda no Corte feito, e baixa o que está gravado
- **Regra:** planejar → confirmar (grava e reserva) → cortando (relógio) → **corte feito (baixa tudo junto, atômico)** → guardar. A baixa é do `plano.proposta`, nunca de um plano recalculado. `plano.confirmado` continua querendo dizer "baixou" e só vira 1 no Corte feito; a etapa mora em `etapa`. `tecido/dominio/corte.js` é o dono único.
- **Por quê:** em 01/10/2026 o Confirmar já baixava, e a sobra ficou "usada" com o rolo baixando a menos. Painel, comprometido e gerencial leem `confirmado` com o sentido de "baixou".
- **Exceções:** os cortes de antes viraram `feito` na migração 27 (R28).
- **Teste que trava:** `tecido/teste/corte_etapas.test.js`.
- **Status:** no ar desde 01/10/2026 · conferido na bancada em 02/10/2026 (prova 1 de 4).
- **História:** "O corte em etapas".

### R-SMK-02 · A reserva é a faixa de um corte aberto, sem tabela própria
- **Regra:** sobra de corte aberto não é oferecida a outro plano, que diz por quê (`reservada`); o rolo aparece com o saldo menos os metros reservados; o pedido num corte aberto conta como já cortado. Cancelar solta tudo e guarda o motivo; o cancelado não conta como cortado.
- **Por quê:** uma tabela de reserva seria a segunda afirmação sobre o mesmo fato, e a que fica para trás prende a sobra para sempre.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/corte_etapas.test.js`.
- **Status:** no ar desde 01/10/2026.

### R-SMK-03 · Um corte aberto por operador, e mexe nele quem o abriu
- **Regra:** um corte aberto por pessoa (a pendência de guardar não conta). Mexe quem abriu ou quem tem `corte.gerir`. "Voltar ao plano" apaga o corte do ②; do ③ em diante só se cancela, com motivo. O corte aberto se reencontra depois de recarregar a tela.
- **Por quê:** um "cancelado" por cada vez que alguém conferiu o resumo encheria o histórico de cortes que nunca existiram.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/corte_etapas.test.js`.
- **Status:** no ar desde 01/10/2026.

### R-SMK-04 · A sobra nascida mora em `sobra_a_guardar` até ser guardada
- **Regra:** a sobra nova não é linha de `sobra` e não entra em plano até ser guardada com medida, etiqueta e endereço juntos. A medida calculada vem escrita e a lista vem vazia. Quem tem `corte.gerir` vê as pendências de todos, com quem cortou.
- **Por quê:** sem etiqueta ninguém acha a sobra na prateleira; morando à parte, nenhuma consulta precisa lembrar de filtrá-la. Medida pré-marcada é medida que se salva sem olhar.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/corte_etapas.test.js`.
- **Status:** no ar desde 01/10/2026.

### R-SMK-05 · Durante o corte o operador muda o plano sozinho, com motivo e pela mesma conta
- **Regra:** no ③: não usar a fonte, o item saiu de outra fonte, rolo acabou e cortado errado (vira sobra marcada ou refugo medido, e o item volta). Toda edição exige motivo da lista de Motivos e vira linha em `plano_edicao`; vira restrição da entrada e o plano é recalculado pelo mesmo `plano.calcular`. Fonte onde o item não cabe é recusada, e nada muda. Só se edita o que está cortando.
- **Por quê:** conta própria da edição seria a segunda régua do plano.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/corte_correcao.test.js`.
- **Status:** no ar desde 01/10/2026.

### R-SMK-06 · Depois do Corte feito corrige-se pedindo, e quem pediu não aprova
- **Regra:** o operador pede (`corte.pedir_correcao`); pendente, nada no estoque muda. Outra pessoa aprova (`corte.aprovar_correcao`) e o sistema aplica a **diferença**: a sobra volta ao endereço, o rolo acerta como consumo, a sobra que não nasceu sai (a guardar é cancelada, a guardada vira `anulada`), o refugo é refeito. Na correção todo item tem fonte fixa. A verdade do que foi baixado é o `movimento_rolo`. Uma correção pendente por corte; bloqueada se a sobra "que não nasceu" já foi usada.
- **Por quê:** a regra das duas pessoas do §18, por analogia — confirmada pelo dono em 02/10/2026 (`DECISOES.md`). Deixar o plano escolher fonte ali inventaria um corte que ninguém fez.
- **Exceções:** os cortes de antes das etapas também se corrigem, pelo movimento (R28).
- **Teste que trava:** `tecido/teste/corte_correcao.test.js`.
- **Status:** no ar desde 01/10/2026 · a correção do corte de 01/10 foi conferida em 02/10/2026 (prova 2 de 4).

### R-SMK-07 · O tom é pela origem, e o pedido dividido entre origens se confere
- **Regra:** `tecido/dominio/tom.js` é o dono da origem de tom (o rolo; a sobra dele; a de sobra sobe até o rolo; a do mutirão é sozinha). O pedido inteiro numa fonte vence; senão divide entre fontes da mesma origem; senão entre origens diferentes, e cada fonte pede **"Conferi o tecido"** no Cortando — o Corte feito é recusado sem elas, dizendo quais, e mudar a fonte zera a conferência. Só divide se couber inteiro. O pedido já cortado só continua no **mesmo tecido**.
- **Por quê:** uma peça na sobra e duas na bobina dá duas cores na mesma janela; o pedido de duas cores mandava a segunda cor para o rolo da primeira.
- **Exceções:** peça sem pedido é livre.
- **Teste que trava:** `tecido/teste/tom.test.js`.
- **Status:** no ar desde 01/10/2026 · o caso da S-000091 foi conferido em 02/10/2026 (prova 4 de 4).

### R-SMK-08 · Toda linha diz para quem é, e o tempo por m² é das peças
- **Regra:** cada linha é **cliente final, revenda ou ML sob medida**; o Confirmar recusa linha sem tipo; a revenda vem da carteira por porta própria (`GET /api/planos/revendas`, só id e nome) e o nome fica como retrato. O relógio corre do CORTAR ao Corte feito menos as pausas; corte misturado divide o tempo pela área das peças; corte acima de `corteTempoMaxHoras` (nasce em 3 h, zero recusado) fica fora da média, e a tela diz quantos. Corte sem relógio fica fora, contado à parte.
- **Por quê:** o m² puxado do rolo faria o corte com muito desperdício parecer mais rápido. Corte sem relógio não é corte rápido.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/tempo_corte.test.js`.
- **Status:** no ar desde 01/10/2026.

### R-SMK-09 · A etiqueta da sobra se lê pela foto, e só vale o que fecha o dígito
- **Regra:** o botão 📷 dos campos de bipe de sobra lê a foto pelo `public/barras_ler.js` (mesma tabela do `barras.js`) e põe o código **no campo**, pelo caminho do bipe. Só vale o que fecha o dígito verificador; não há melhor palpite. Foto, não câmera ao vivo.
- **Por quê:** código errado lido com confiança é sobra trocada na prateleira. Câmera ao vivo pede HTTPS (dívida 2).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/barras_ler.test.js` (imagens sintéticas).
- **Status:** no ar desde 01/10/2026 · conferido no iPad em 02/10/2026 (prova 3 de 4).

### R-SMK-10 · Entre as sobras que servem vence a de menos refugo, e a que não entrou diz por quê
- **Regra:** a ordem é condição (íntegra antes de defeito) → menor refugo → menor área. A sobra que servia e não entrou diz por quê também quando o plano usou outra (`outra_sobra`, nomeando a escolhida; a gêmea diz que é gêmea; a reservada aparece). Cada sobra usada mostra `usa · vira sobra · refugo`, somando 100, e o resumo mostra o refugo do corte ao lado da média dos últimos 30 dias (`painel.refugoMedio`), que é `null` sem corte, nunca zero. Não há limite de perda.
- **Por quê:** a menor sobra pode virar só tira de refugo; a maior pode devolver sobra nova. O caso de 01/10 era o da sobra que servia e ficou de fora sem explicação.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/plano_claro.test.js` · `tecido/teste/tom.test.js` (R4).
- **Status:** no ar desde 01/10/2026.

### R-SMK-11 · O histórico do corte acha pela sobra e diz o que foi baixado
- **Regra:** o botão **Histórico** lista os cortes (mais novo primeiro), filtra por pedido, operador e dia (dia fora do formato é recusado); a busca por sobra acha o corte que a usou e o de onde ela nasceu; o detalhe mostra a sobra marcada como usada com o status de hoje, os metros do rolo lidos do movimento, as sobras nascidas e o refugo. Não traz preço.
- **Por quê:** é por ele que se pede a correção, e a verdade do que foi baixado é o movimento.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/historico_corte.test.js`.
- **Status:** no ar desde 01/10/2026.

---

## O que ainda não tem teste no sob medida

R-SMM-01 (o try/catch que protege a expedição), R-SMD-01 (a paleta igual à do
PCP), R-SME-04 (sem ourela), a parte de tela da R-SMP-06 (o pedido sem peça não
mostra `R$ 0,00`), a parte de tela da R-SMU-03 (o traço no lugar do `0 m²`),
R-SMS-02 (setor é cadastro, chave é código), parte da R-SMX-05 (os oito motivos
semeados, a exclusão recusada e os dois cadastros separados), a parte de tela
da R-SMI-07, as frases da R-SMF-09, as duas partes de tela da R-SMF-10 (a
revenda que se mantém depois de lançar e os selos separados) e o `inline-flex`
da R-SML-03.
