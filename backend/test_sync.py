import sys
sys.path.insert(0, '.')
from services.yf_sync import sync_stock_incremental

if __name__ == '__main__':
    print("Testing TKNSA incremental...")
    sync_stock_incremental('TKNSA')
