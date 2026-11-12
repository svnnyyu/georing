// The hamburger menu (a tile grid, like Krillion and Eraly) and the Settings popup.

import { ClockIcon, GearIcon, InfoIcon, PlayIcon } from '../components/Icons.tsx';
import { SectionLabel } from '../components/Controls.tsx';
import { Modal } from '../components/Modal.tsx';
import { SettingsForm } from './SettingsForm.tsx';

export function MenuDialog({
  onClose,
  onNewGame,
  onSettings,
  onHistory,
  onAbout,
}: {
  onClose: () => void;
  onNewGame: () => void;
  onSettings: () => void;
  onHistory: () => void;
  onAbout: () => void;
}) {
  return (
    <Modal kicker="GeoRing" title="Menu" onClose={onClose}>
      <SectionLabel>Play</SectionLabel>
      <div className="tile-grid">
        <button type="button" className="menu-tile" onClick={onNewGame}>
          <PlayIcon />
          New game
        </button>
        <button type="button" className="menu-tile" onClick={onSettings}>
          <GearIcon />
          Settings
        </button>
      </div>
      <SectionLabel>More</SectionLabel>
      <div className="tile-grid">
        <button type="button" className="menu-tile" onClick={onHistory}>
          <ClockIcon />
          History
        </button>
        <button type="button" className="menu-tile" onClick={onAbout}>
          <InfoIcon />
          About
        </button>
      </div>
    </Modal>
  );
}

export function SettingsDialog({ onClose, inGame }: { onClose: () => void; inGame: boolean }) {
  return (
    <Modal kicker="GeoRing" title="Settings" onClose={onClose}>
      {inGame && <p className="dim small">Changes apply to the next game.</p>}
      <SettingsForm />
      <button type="button" className="btn primary full" onClick={onClose}>
        Done
      </button>
    </Modal>
  );
}
