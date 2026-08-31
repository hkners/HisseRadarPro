import sqlite3
import json

def test():
    conn = sqlite3.connect('scraped_reports.db')
    conn.row_factory = sqlite3.Row
    row = conn.execute('SELECT fundamentals_json FROM company_info WHERE ticker="TKNSA"').fetchone()
    print(row['fundamentals_json'][:500])

if __name__ == '__main__':
    test()
