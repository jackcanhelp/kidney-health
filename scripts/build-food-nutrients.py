# Rebuild food-nutrients.json from the TFDA open data CSV (data.gov.tw dataset 8543, InfoId=20).
# Usage: python -I scripts/build-food-nutrients.py <path/to/20_2.csv> food-nutrients.json
import csv,sys,json,re,collections
src,out=sys.argv[1],sys.argv[2]
foods=collections.OrderedDict()
for r in csv.DictReader(open(src,encoding='utf-8-sig')):
    fid=r['整合編號']
    f=foods.setdefault(fid,{'id':fid,'n':r['樣品名稱'].strip(),'a':r['俗名'].strip(),'c':r['食品分類'].strip(),'d':r['內容物描述'].strip()})
    key={'鉀':('k','mg'),'磷':('p','mg'),'粗蛋白':('pr','g')}.get(r['分析項'])
    if key:
        assert r['含量單位']==key[1],(fid,r['含量單位'])
        v=r['每100克含量'].strip()
        f[key[0]]=float(v) if v else None
rows=[]
for f in foods.values():
    m=re.search(r'樣品狀態:([^;]*)',f['d'])
    state=(m.group(1).strip() if m else '')[:30]
    def num(x):
        return None if x is None else (int(x) if x==int(x) else round(x,1))
    rows.append({'id':f['id'],'n':f['n'],'a':f['a'],'c':f['c'],'s':state,'k':num(f.get('k')),'p':num(f.get('p')),'pr':num(f.get('pr'))})
rows.sort(key=lambda x:x['id'])
print('missingPr',sum(r['pr'] is None for r in rows));print('foods',len(rows),'missingK',sum(r['k'] is None for r in rows),'missingP',sum(r['p'] is None for r in rows))
json.dump({'source':'衛生福利部食品藥物管理署 食品營養成分資料集(政府資料開放平台 dataset 8543,InfoId=20)','license':'政府資料開放授權條款-第1版','unit':'k、p 為 mg/100g 可食部分;pr(粗蛋白)為 g/100g','retrieved':'2026-11-13','foods':rows},open(out,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
for n in ['香蕉','北蕉','白飯','雞蛋','大番茄平均值','楊桃']:
    print(n,[ (r['n'],r['s'],r['k'],r['p']) for r in rows if n in r['n'] or n in r['a']][:4])
