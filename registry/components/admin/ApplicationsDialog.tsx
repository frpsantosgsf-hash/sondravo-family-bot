'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ApplicationsPanel } from '@/components/applications/ApplicationsPanel';

interface ApplicationsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Hetzelfde overzicht als op /sollicitaties, maar dan in een venster.
 *
 * Bewust één component voor allebei: anders lopen de twee weergaven uit
 * elkaar zodra er iets bijkomt, en ziet de Lead iets anders dan zijn leden.
 * Of de knoppen om aan te nemen of af te wijzen verschijnen, bepaalt de
 * server — niet deze dialoog.
 */
export function ApplicationsDialog({ open, onClose }: ApplicationsDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sollicitaties"
      description="Wat de familie heeft gestemd, en jouw besluit."
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Sluiten
          </Button>
        </div>
      }
    >
      <ApplicationsPanel isAdmin />
    </Modal>
  );
}
