import sqlite3
import json

conn = sqlite3.connect('scraped_reports.db')
c = conn.cursor()
tickers = ['MACKO', 'ANHYT', 'RGYAS', 'DOHOL', 'AKGRT', 'TRCAS', 'THYAO', 'GARAN', 'ASELS', 'BIMAS', 'FROTO', 'SAHOL']
for t in tickers:
    c.execute('SELECT technical_analysis_json FROM company_info WHERE ticker=?', (t,))
    row = c.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        summary = data.get('summary', {})
        print(f"{t}: {summary.get('RECOMMENDATION')} (score={summary.get('RECOMMENDATION_SCORE')})")
    else:
        print(f"{t}: NO TA DATA")
conn.close()
