# Roteiro do vídeo — 3 minutos

**Gravado e publicado:** https://youtu.be/ZoxlmvQWWCg — 2 min 54 s, 1080p, sem exigir login.

Regra do evento: até 3 minutos, acessível sem login, mostrando **o produto funcionando**.
Grave a tela em 1080p, com o cursor visível e zoom alto onde o número importa. Fale em português.

Antes de gravar: abra a demo em [barrosyan.github.io/afero](https://barrosyan.github.io/afero/),
deixe o cenário **"Medidor de vazão descalibrado"** selecionado e o modo auditoria ligado.

---

### 0:00 – 0:20 · O problema

> "Numa planta industrial, o painel de manutenção preditiva dispara: vazão 8 % abaixo do esperado,
> falha hidráulica, troca o rotor. O rotor é trocado — e a bomba estava boa. O que tinha derivado
> era o medidor de vazão. Esse falso positivo custa peça, parada e, principalmente, a confiança do
> time no sistema."

*Tela:* painel do Afero, cenário do medidor descalibrado.

### 0:20 – 0:45 · O que é o Afero

> "O Afero é um gêmeo digital industrial que **prova o que afirma**. Ele mede a mesma grandeza por
> caminhos independentes, roda física de verdade — curva da bomba, balanço de energia, NPSH, modelo
> térmico — e só conclui quando as verificações sustentam a conclusão. Se não sustentam, ele se
> recusa a concluir. Tudo isso roda no navegador, agora."

*Tela:* rolar a página mostrando os cartões de verificação e o índice de confiança.

### 0:45 – 1:35 · O momento "aha" (o coração do vídeo)

> "Olha o diagnóstico: **medidor de vazão fora de calibração**, com 93 % de confiança."

*Apontar, um por um:*

> "Os dois medidores de vazão discordam 7,9 % entre si — em regime permanente, massa não se cria.
> A estimativa independente pela potência elétrica dá 120 m³/h, contra 110 do medidor.
> E aqui está a prova de que a bomba está sã: na vazão efetiva, a altura medida bate com a curva
> da bomba em 0,05 %."

*Apontar o painel "Com e sem verificação":*

> "O detector por limiar, na mesma janela, manda substituir o rotor. R$ 38 mil e 12 horas de
> parada. O Afero manda calibrar o medidor: R$ 1.800 e uma hora. É a peça certa, pelo motivo certo."

### 1:35 – 2:05 · A prova de que ele não é só "do contra"

*Clicar no cenário "Desgaste real do rotor".*

> "Agora o mesmo sistema, com desgaste real de rotor. Aqui os dois medidores **concordam** — não é
> instrumento. E a curva da bomba está 6 % abaixo: o equipamento perdeu altura de verdade.
> Mesma tela, conclusão oposta, porque a física é outra. É isso que separa sintoma de causa."

### 2:05 – 2:30 · A recusa é a feature

*Clicar no cenário "Instrumentação degradada".*

> "E quando o dado não presta? Sensor de temperatura travado, 70 minutos de lacuna. O índice de
> confiança é travado em 25 e o Afero **recusa concluir** sobre o equipamento: pede o reparo da
> aquisição antes de qualquer laudo. Um sistema que arredonda a própria ignorância para 'ok' não é
> confiável."

*Clicar em "Procedência das afirmações".*

> "Cada frase do relatório cita a verificação que a sustenta. Quando o texto é gerado por LLM, ele
> passa pelo mesmo validador: frase que cita número que ninguém mediu é descartada na hora."

### 2:30 – 2:50 · O resultado medido

*Mostrar `benchmarks/REPORT.md` no GitHub.*

> "Seis cenários, vinte e cinco sementes de ruído cada, 150 diagnósticos. O detector por limiar
> acerta 33 % e produz 50 falsos positivos de falha do equipamento. O Afero acerta 150 de 150, com
> zero falso positivo e zero falso negativo. O relatório é gerado por script e o CI falha se ele
> estiver desatualizado — nenhum desses números foi digitado à mão."

### 2:50 – 3:00 · Fecho

> "Afero: o gêmeo digital que prova o que afirma — e sabe dizer quando não pode afirmar.
> Código aberto, licença MIT, no link da descrição."

---

## Checklist de gravação

- [x] Duração ≤ 3:00 (corte seco, sem introdução longa) — 2:54
- [x] Demonstração com o produto **funcionando**, não slides
- [x] Áudio limpo; legenda embutida ajuda o júri — narração sintetizada em pt-BR, legendas gravadas na própria página
- [x] Publicar sem exigir login (YouTube não listado ou link direto) — https://youtu.be/ZoxlmvQWWCg
- [x] Descrição com: demo, repositório, trilha
- [x] Resolução 1080p, fonte legível em tela cheia
