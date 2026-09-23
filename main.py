class YetersizbakiyeError(Exception):
    pass

bakiye=900
cekilen=1400

try:
    if cekilen > bakiye :
        print(f"hesapta bakiye {bakiye} tl olup , çekmek istediğiniz tutar {cekilen} altındadır lütfen bakiye yükleyin")
except YetersizbakiyeError as hata :
    print("banka uyarısı ", hata)