import sqlite3

def test():
    conn = sqlite3.connect('scraped_reports.db')
    conn.row_factory = sqlite3.Row
    row = conn.execute('SELECT MAX(date) as md FROM historical_prices WHERE ticker="TKNSA"').fetchone()
    print("TKNSA MAX DATE:", row['md'])

if __name__ == '__main__':
    test()
