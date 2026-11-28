"""JSON file adapter; optional SciPy dependencies are isolated in verification/."""
import sys,json,importlib.util
from pathlib import Path
sys.dont_write_bytecode=True
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'verification'/'research-python'))
spec=importlib.util.spec_from_file_location('search',root/'kernel'/'inextensible_film_search.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
p=json.loads(Path(sys.argv[1]).read_text())
def progress(row):
    Path(sys.argv[2]+'.partial').write_text(json.dumps(row))
    print(json.dumps({k:v for k,v in row.items() if k!='positionsMm'}),flush=True)
result=module.search(p,max_evaluations=int(sys.argv[3]) if len(sys.argv)>3 else 2500,seed_wave_mm=float(sys.argv[4]) if len(sys.argv)>4 else 0,progress_callback=progress)
Path(sys.argv[2]).write_text(json.dumps(result))
print(json.dumps({k:v for k,v in result.items() if k!='frames'}),flush=True)
