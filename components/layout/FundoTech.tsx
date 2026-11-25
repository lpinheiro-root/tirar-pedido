/** Fundo "tecnologia" fixo das telas: grade, brilhos e trilhas de circuito com pulsos de luz (SVG próprio, sem imagem). */
const TRILHAS = [
  'M1600 70 H1400 L1350 120 H1200',
  'M1600 210 H1480 L1430 160 H1290',
  'M1600 340 H1420 L1380 380 H1260',
  'M0 640 H160 L210 690 H360',
  'M0 780 H260 L310 730 H420',
  'M0 870 H120 L160 830 H280',
];

export function FundoTech() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#f3f6ff_0%,#f5f7ff_55%,#f1f5ff_100%)]" />
      <div className="absolute -right-24 -top-32 h-[480px] w-[480px] rounded-full bg-[#6366f1]/25 blur-[110px]" />
      <div className="absolute -bottom-40 left-40 h-[440px] w-[440px] rounded-full bg-[#38bdf8]/25 blur-[110px]" />
      <div className="absolute left-1/2 top-1/3 h-[320px] w-[320px] rounded-full bg-[#a855f7]/12 blur-[110px]" />
      <div className="fundo-tech-grade absolute inset-0" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="fundoTechTrilha" x1="0" x2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
        </defs>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {TRILHAS.map((d, i) => (
            <g key={i}>
              <path d={d} stroke="#4f46e5" strokeOpacity="0.22" strokeWidth="1.5" />
              <path
                d={d}
                stroke="url(#fundoTechTrilha)"
                strokeOpacity="0.85"
                strokeWidth="2.5"
                className="fundo-tech-pulso"
                style={{ animationDelay: `${-i * 1.6}s` }}
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
