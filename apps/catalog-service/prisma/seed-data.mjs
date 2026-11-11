// Pilot catalog: the five fixed-price services of the MVP.
// Prices are in cents, VAT included, and are to be calibrated during the pilot.
// Slugs are the identity: change a name freely, but changing a slug creates a new row.

// Where bookings are open. `code` is the INE municipality code (distrito + concelho).
// `postalPrefixes` are the first 4 digits of the postal codes delivered in that municipality.
// PO-box-only prefixes (e.g. 3001, 3004) are left out: nobody lives in a PO box.
// To open another city: add it here with pilot: true and run `npm run db:catalog:seed`.
export const municipalities = [
  {
    code: '0603',
    name: 'Coimbra',
    district: 'Coimbra',
    pilot: true,
    postalPrefixes: ['3000', '3020', '3025', '3030', '3040', '3045'],
  },
];

export const categories = [
  { slug: 'limpezas', name: 'Limpezas', icon: 'sparkles', sortOrder: 1 },
  { slug: 'canalizacao', name: 'Canalização', icon: 'droplet', sortOrder: 2 },
  { slug: 'eletricidade', name: 'Eletricidade', icon: 'zap', sortOrder: 3 },
  { slug: 'pequenas-reparacoes', name: 'Pequenas reparações', icon: 'hammer', sortOrder: 4 },
  { slug: 'eletrodomesticos', name: 'Eletrodomésticos', icon: 'washing-machine', sortOrder: 5 },
];

export const services = [
  {
    slug: 'limpeza-domestica-3h',
    category: 'limpezas',
    name: 'Limpeza doméstica (3 h)',
    description:
      'Três horas de limpeza geral da tua casa por um profissional verificado. Ideal para a manutenção semanal ou quinzenal de um apartamento T1 a T3.',
    priceCents: 4500,
    durationMinutes: 180,
    includes: [
      'Aspirar e lavar o chão',
      'Limpar o pó de móveis e superfícies',
      'Limpeza da cozinha: bancadas, placa, lava-loiça e exterior dos eletrodomésticos',
      'Limpeza das casas de banho',
      'Despejar o lixo',
    ],
    excludes: [
      'Produtos e equipamento de limpeza (usa os da casa)',
      'Limpeza de vidros exteriores e estores',
      'Interior de forno, frigorífico e armários',
      'Engomar e tratar da roupa',
      'Limpezas pós-obra ou de fim de arrendamento',
    ],
    faqs: [
      {
        question: 'Tenho de fornecer os produtos de limpeza?',
        answer:
          'Sim. O profissional usa os produtos, o aspirador e a esfregona que tiveres em casa. Antes da marcação, confirma que tens o essencial.',
      },
      {
        question: 'Três horas chegam para a minha casa?',
        answer:
          'Para uma limpeza de manutenção de um T1 a T3, normalmente sim. Se a casa for maior ou não for limpa há algum tempo, o profissional dá prioridade às divisões que indicares.',
      },
      {
        question: 'Tenho de estar em casa?',
        answer: 'Só precisas de garantir o acesso à hora marcada. Podes sair durante o serviço se preferires.',
      },
    ],
  },
  {
    slug: 'desentupimento-lavatorio-sanita',
    category: 'canalizacao',
    name: 'Desentupimento de lavatório ou sanita',
    description:
      'Desentupimento de um lavatório, lava-loiça, bidé, base de duche ou sanita, com teste de escoamento no final.',
    priceCents: 6500,
    durationMinutes: 60,
    includes: [
      'Deslocação e mão de obra',
      'Desentupimento de um ponto de água (lavatório, lava-loiça, bidé, duche ou sanita)',
      'Desmontagem e limpeza do sifão, quando aplicável',
      'Teste de escoamento no final',
    ],
    excludes: [
      'Entupimentos na coluna do prédio ou na rede de esgotos exterior',
      'Desentupimento com máquina de alta pressão ou inspeção por câmara',
      'Substituição de peças (sifões, tubos, válvulas)',
      'Reparação de fugas ou de tubagens danificadas',
    ],
    faqs: [
      {
        question: 'E se o entupimento for na coluna do prédio?',
        answer:
          'Esse trabalho não está incluído neste preço. O profissional explica-te o que encontrou e o que é preciso fazer a seguir.',
      },
      {
        question: 'Tenho mais de um ponto entupido. Como faço?',
        answer: 'Este preço cobre um ponto de água. Para mais pontos, faz uma marcação por cada um.',
      },
      {
        question: 'São usados produtos químicos?',
        answer:
          'O desentupimento é feito por meios mecânicos (desentupidor, mola). Se já usaste algum produto químico, avisa o profissional à chegada, por segurança.',
      },
    ],
  },
  {
    slug: 'substituicao-tomada-interruptor',
    category: 'eletricidade',
    name: 'Substituição de tomada ou interruptor',
    description:
      'Substituição de uma tomada ou de um interruptor existente por um novo, com verificação do funcionamento no final.',
    priceCents: 3500,
    durationMinutes: 45,
    includes: [
      'Deslocação e mão de obra',
      'Remoção da tomada ou do interruptor antigo',
      'Instalação do novo, no mesmo local',
      'Teste de funcionamento e de segurança',
    ],
    excludes: [
      'A tomada ou o interruptor novo (compra o modelo que preferires)',
      'Abertura de roços ou passagem de cabos novos',
      'Criação de pontos de eletricidade onde não existem',
      'Reparação de avarias no quadro elétrico ou na instalação',
    ],
    faqs: [
      {
        question: 'Tenho de comprar a tomada ou o interruptor?',
        answer:
          'Sim. Assim escolhes o modelo e a cor que combinam com os restantes. Em caso de dúvida, tira uma fotografia ao atual e pede um equivalente na loja.',
      },
      {
        question: 'É preciso desligar a eletricidade da casa?',
        answer:
          'O profissional desliga o circuito correspondente no quadro durante o trabalho. Podes ficar sem eletricidade nessa zona da casa durante alguns minutos.',
      },
      {
        question: 'Posso substituir várias de uma vez?',
        answer: 'Este preço cobre uma unidade. Para mais, faz uma marcação por cada uma.',
      },
    ],
  },
  {
    slug: 'montagem-movel-2h',
    category: 'pequenas-reparacoes',
    name: 'Montagem de móvel (até 2 h)',
    description:
      'Montagem de um móvel de kit (por exemplo, roupeiro pequeno, cómoda, estante ou secretária), seguindo as instruções do fabricante, até duas horas de trabalho.',
    priceCents: 4000,
    durationMinutes: 120,
    includes: [
      'Deslocação e mão de obra até 2 horas',
      'Montagem segundo as instruções do fabricante',
      'Ferramentas necessárias',
      'Colocação do móvel no local, na mesma divisão',
    ],
    excludes: [
      'Fixação à parede e furações',
      'Transporte do móvel desde a loja',
      'Desmontagem ou remoção de móveis antigos',
      'Móveis que precisem de mais de 2 horas ou de duas pessoas (roupeiros grandes, cozinhas)',
      'Remoção das embalagens',
    ],
    faqs: [
      {
        question: 'E se a montagem demorar mais de 2 horas?',
        answer:
          'O profissional avisa-te antes de terminar o tempo. Móveis grandes, como roupeiros de portas de correr, não cabem neste serviço.',
      },
      {
        question: 'O que devo ter pronto?',
        answer:
          'O móvel na divisão onde vai ficar, todas as caixas e as instruções. Confirma que não faltam peças antes da hora marcada.',
      },
      {
        question: 'O profissional fixa o móvel à parede?',
        answer: 'Não. Este serviço não inclui furações nem fixações à parede.',
      },
    ],
  },
  {
    slug: 'reparacao-maquina-lavar',
    category: 'eletrodomesticos',
    name: 'Reparação de máquina de lavar (diagnóstico e mão de obra base)',
    description:
      'Visita de um técnico para diagnosticar a avaria da tua máquina de lavar roupa, com até uma hora de mão de obra para reparações simples.',
    priceCents: 5500,
    durationMinutes: 60,
    includes: [
      'Deslocação',
      'Diagnóstico da avaria',
      'Até 1 hora de mão de obra',
      'Reparações simples sem peças (filtro entupido, mangueiras, nivelamento)',
      'Orçamento para a reparação, se forem precisas peças',
    ],
    excludes: [
      'Peças de substituição',
      'Reparações que exijam levar a máquina para a oficina',
      'Segunda visita para instalar peças encomendadas',
      'Máquinas de lavar loiça, de secar ou outros eletrodomésticos',
    ],
    faqs: [
      {
        question: 'E se forem precisas peças?',
        answer:
          'O técnico diz-te qual é a avaria e quanto custa a reparação com peças. Decides nesse momento se queres avançar. O preço deste serviço cobre o diagnóstico e a primeira hora.',
      },
      {
        question: 'E se a máquina não tiver arranjo?',
        answer:
          'O diagnóstico é pago na mesma, porque inclui a deslocação e o tempo do técnico. Ficas a saber o estado da máquina antes de decidir comprar outra.',
      },
      {
        question: 'Que informação devo ter à mão?',
        answer: 'A marca e o modelo da máquina (estão na etiqueta junto à porta) e uma descrição do problema.',
      },
    ],
  },
];
