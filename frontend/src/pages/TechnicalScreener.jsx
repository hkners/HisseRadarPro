import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell } from 'lucide-react';
import PageContainer from '../components/common/PageContainer';
import { PillTabs, Button } from '../components/ui';
import { useTaData, BuildingNotice } from '../components/ta/common';
import MarketTab from './technical/MarketTab';
import ScreenerTab from './technical/ScreenerTab';
import SignalsTab from './technical/SignalsTab';
import ModelTab from './technical/ModelTab';

const TABS = [
  { id: 'piyasa', label: 'Piyasa' },
  { id: 'tarama', label: 'Tarama' },
  { id: 'karne', label: 'Sinyal karnesi' },
  { id: 'model', label: 'Model' },
];

export default function TechnicalScreener() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('sekme') || 'tarama';
  const [signalFilter, setSignalFilter] = useState(params.get('sinyal') || '');
  const setTab = (id) => setParams(p => { p.set('sekme', id); return p; }, { replace: true });
  const overview = useTaData('/ta/overview');
  const screener = useTaData('/ta/screener');
  const signals = useTaData('/ta/signals');
  const building = overview.building || screener.building || signals.building;
  const error = overview.error || screener.error || signals.error;

  const showStocks = (key) => { setSignalFilter(key); setTab('tarama'); };

  return (
    <PageContainer
      title="Teknik Radar"
      subtitle="Kendi fiyat geçmişimizden hesaplanan göstergeler, BIST'te test edilmiş sinyaller ve örneklem dışı doğrulanmış teknik skor."
      badge={overview.data ? `Veri ${overview.data.as_of}` : undefined}
      headerRight={<>
        <PillTabs tabs={TABS} value={tab} onChange={setTab} />
        <Button size="sm" to="/alarms"><Bell size={13} /> Sinyal alarmı</Button>
      </>}
      scrollable
    >
      <div style={{ paddingBottom: 16 }}>
        {building && <BuildingNotice building={building} />}
        {error && <div className="notice" style={{ borderColor: 'rgba(192, 82, 78, 0.5)' }}>Teknik analiz yüklenemedi: {error}</div>}
        {tab === 'piyasa' && overview.data && <MarketTab ov={overview.data} />}
        {tab === 'tarama' && screener.data && <ScreenerTab key={signalFilter} data={screener.data} initialSignal={signalFilter} />}
        {tab === 'karne' && signals.data && <SignalsTab data={signals.data} onShowStocks={showStocks} />}
        {tab === 'model' && overview.data && <ModelTab ov={overview.data} />}
      </div>
    </PageContainer>
  );
}
