import React from 'react';

export default function ClientsSection() {
  const logos = [
    { name: '4th Whale', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-4th-whale-2x.png', width: 160, height: 126 },
    { name: 'Axify', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-axify-2x.png', width: 160, height: 46 },
    { name: 'Illuxi', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-illuxi-2x.png', width: 160, height: 42 },
    { name: 'Kolortrak', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-kolortrak-2x.png', width: 160, height: 19 },
    { name: 'MUUTAA', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-muutaa-2x.png', width: 160, height: 48 },
    { name: 'RTINGS.com', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-rtings-2x.png', width: 160, height: 36 },
    { name: 'Université Laval', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-ul-2x.png', width: 160, height: 69 },
  ];

  return (
    <section className="clients-section">
      <div className="clients-container">
        <div className="clients-header">
          <h2>Clients</h2>
        </div>

        <div className="logo-carousel">
          <div className="logo-track">
            {/* First set of logos */}
            {logos.map((logo, idx) => (
              <div className="logo-slide" key={`${logo.name}-1-${idx}`}>
                <img src={logo.src} alt={logo.name} width={logo.width} height={logo.height} loading="lazy" />
              </div>
            ))}
            {/* Second set of logos for infinite loop */}
            {logos.map((logo, idx) => (
              <div className="logo-slide" key={`${logo.name}-2-${idx}`}>
                <img src={logo.src} alt={logo.name} width={logo.width} height={logo.height} loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
