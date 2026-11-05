# Dados para o formulário de submissão

Copie e cole no painel do time em hackbrasil.com.

## Nome do projeto

Afero

## Tagline

O gêmeo digital industrial que prova o que afirma — e se recusa a concluir quando o dado não sustenta.

## Trilha

Logística e automação

## Descrição curta (até 280 caracteres)

Gêmeo digital verificado para ativos industriais: roda física real sobre a telemetria, mede por
caminhos independentes e só conclui quando as verificações sustentam. Detecta se a falha é do
equipamento ou do instrumento — e recusa laudo quando o dado não presta.

## Descrição completa

Manutenção preditiva por limiar confunde sintoma com causa: quando um medidor de vazão deriva, o
sistema acusa falha do equipamento e a planta troca um rotor que estava bom. O custo aparece duas
vezes — na peça e na parada desnecessárias, e na confiança do time, que nunca mais volta.

O Afero é um gêmeo digital que separa as duas coisas. Ele recebe uma janela de telemetria de um
conjunto motobomba, roda o modelo físico do ativo (curva da bomba, leis de semelhança, NPSH,
balanço de energia, modelo térmico do motor) e executa nove verificações independentes, cada uma
com limite declarado e evidência auditável. A vazão é medida por três caminhos que não dependem
uns dos outros — dois medidores e a estimativa pela potência elétrica (método do torque) — e é
essa redundância que torna a pergunta "sensor ou desgaste?" identificável, em vez de palpite.

O resultado é um laudo com duas confianças separadas e explícitas: uma para os números da janela,
outra para a causa apontada. Quando a aquisição está degradada, o índice é travado e o sistema
recusa concluir — em vez de arredondar a própria ignorância para "ok". Cada frase do relatório cita
a verificação que a sustenta, inclusive quando o texto é gerado por LLM: o validador de
rastreabilidade descarta qualquer narrativa que afirme número que ninguém mediu.

No benchmark do repositório — 6 cenários com verdade conhecida, 25 sementes de ruído cada, 150
diagnósticos — o Afero acerta 150 de 150, contra 50 de 150 (33 %) do detector por limiar, com zero
falso positivo de falha do equipamento. O relatório é gerado por script e o CI falha se estiver
desatualizado.

Fecha o ciclo de automação industrial: telemetria → verificação física → diagnóstico atribuído →
ordem de serviço no sistema de manutenção (CMMS), com a evidência anexada.

## Links

- Repositório: https://github.com/barrosyan/afero
- Demo (online, sem login): https://barrosyan.github.io/afero/
- Vídeo (até 3 min): _link público a preencher — gravação pronta (2 min 54 s, 1920×1080, pt-BR)_

## Tecnologias

TypeScript, React, Vite, Node.js, GitHub Actions, GitHub Pages. Núcleo de física e verificação sem
dependências externas. Serviço HTTP opcional com narrativa por LLM (Claude) validada contra as
verificações — o produto funciona integralmente sem LLM.

## Time

Yan Barros (individual)
