import type { Metadata } from 'next';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { RegistryHeader } from '@/components/registry/RegistryHeader';
import { RegistryView } from '@/components/registry/RegistryView';
import { getRegistryData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ledenlijst',
  description: 'Official member registry of The Sondravo Family.',
};

export default async function LedenPage() {
  const { members, ranks, settings, viewer, configError } = await getRegistryData();

  return (
    <>
      <SiteNav viewer={viewer} current="/leden" />

      <main id="hoofdinhoud" className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <RegistryHeader
          familyName={settings.familyName}
          total={members.length}
          limit={settings.memberLimit}
        />

        {configError ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-sondravo-red/35 bg-sondravo-red/10 px-4 py-3 text-sm leading-relaxed text-[#f2a9ac]"
          >
            {configError}
          </p>
        ) : null}

        {viewer && !viewer.isAdmin ? (
          <p
            role="status"
            className="mt-6 rounded-lg border border-line bg-panel-high px-4 py-3 text-sm leading-relaxed text-muted"
          >
            Je bent ingelogd, maar dit account heeft geen beheerrechten. Vraag een Lead om je toe
            te voegen aan de admins.
          </p>
        ) : null}

        <div className="mt-6 sm:mt-8">
          <RegistryView members={members} ranks={ranks} settings={settings} viewer={viewer} />
        </div>
      </main>

      <SiteFooter familyName={settings.familyName} />
    </>
  );
}
