// The About popup: how to play, and credits for the data and fonts (their licences require
// attribution; see docs/SPEC.md -> Data -> Sources).

import { SectionLabel } from '../components/Controls.tsx';
import { Modal } from '../components/Modal.tsx';

/** A link that opens in a new tab. */
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal kicker="GeoRing" title="About" onClose={onClose}>
      <section>
        <SectionLabel>How to play</SectionLabel>
        <ul className="about-list">
          <li>Rings are drawn around a start city. Name the most populous city inside each one.</li>
          <li>
            In Countries mode, name the country with the most people living inside the ring: only the part of it inside the
            ring counts.
          </li>
          <li>Wrong guesses inside the ring cost one of 3 misses; guesses outside it are free.</li>
          <li>Stuck? The lightbulb gives up to 3 hints: the country, an area, then the city's dot and first letter.</li>
          <li>Settings change the ring size, the number of rings, how many top cities to find, and city or metro populations.</li>
        </ul>
      </section>

      <section>
        <SectionLabel>Data and credits</SectionLabel>
        <ul className="about-list credits">
          <li>
            Cities, coordinates and populations: <Ext href="https://www.geonames.org/">GeoNames</Ext>, licensed under{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>.
          </li>
          <li>
            Metro areas: GHS Urban Centre Database R2024A, European Commission, Joint Research Centre (2024),{' '}
            <Ext href="https://doi.org/10.2905/1a338be6-7eaf-480c-9664-3a8ade88cbcd">doi:10.2905/1a338be6</Ext>. © European
            Union, reused with acknowledgement.
          </li>
          <li>
            People inside each ring (Countries mode): GHS-POP R2023A population grid, European Commission, Joint Research
            Centre, <Ext href="https://doi.org/10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE">doi:10.2905/2ff68a52</Ext>. ©
            European Union, reused with acknowledgement.
          </li>
          <li>
            Urban populations of Chinese cities: 2020 census of China, via Thomas Brinkhoff:{' '}
            <Ext href="https://www.citypopulation.de/">City Population</Ext> (
            <Ext href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</Ext>) and Wikipedia.
          </li>
          <li>
            Maps: <Ext href="https://www.naturalearthdata.com/">Natural Earth</Ext> (public domain).
          </li>
          <li>
            Fonts: Pixelify Sans and IBM Plex Mono, via Google Fonts (
            <Ext href="https://openfontlicense.org/">SIL Open Font License</Ext>).
          </li>
        </ul>
        <p className="dim small about-note">
          Populations come from different census years in different countries, so a few rankings may be out of date.
        </p>
      </section>

      <p className="small about-note">
        <Ext href="https://github.com/svnnyyu/georing">Source code on GitHub</Ext>
      </p>
    </Modal>
  );
}
