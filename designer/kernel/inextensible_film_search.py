"""Optional research solve: exact root/prior-weld identities, free planar clamp XY.

Results require independent metric/contact checks. Solver success is not proof.
"""
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import coo_matrix


def search(problem, max_evaluations=2500, seed_wave_mm=0.0, progress_callback=None):
    initial = np.asarray(problem['initialMm'], float)
    seed = np.asarray(problem['seedFrame']['positionsMm'], float)
    flat = np.asarray(problem['flatMm'], float)
    n = len(initial)
    parent = list(range(n))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    def union(a,b):
        parent[find(b)] = find(a)
    for group in problem['priorWeldGroups']:
        for i in group[1:]: union(group[0], i)
    weld_groups = {}
    for i in problem['weld']:
        key = tuple(np.round(flat[i,:2],7))
        weld_groups.setdefault(key,[]).append(i)
    if problem.get('alignMaterialPointsAtNewSeal', False):
        for group in weld_groups.values():
            for i in group[1:]: union(group[0], i)
    groups = {}
    for i in range(n): groups.setdefault(find(i),[]).append(i)
    roots, welds = set(problem['root']) | set(problem.get('bonded',[])), set(problem['weld'])
    base = seed.copy()
    coordinates, values, lower, upper = [], [], [], []
    sign = -1 if problem['end']=='front' else 1
    lookup = np.full((n,3),-1,int)
    for ids in groups.values():
        anchors = [i for i in ids if i in roots]
        is_weld = any(i in welds for i in ids)
        p = initial[anchors[0]].copy() if anchors else seed[ids].mean(axis=0)
        if is_weld: p[2] = problem['sealPlaneZMm']
        if not anchors:
            for k in range(2 if is_weld else 3):
                j=len(values);lookup[ids,k]=j;coordinates.append((ids,k))
                value=p[k]
                if k==2 and seed_wave_mm:
                    t=np.clip(abs(flat[ids[0],1]-problem['rootY'])/abs(problem['sealY']-problem['rootY']),0,1)
                    value+=seed_wave_mm*np.sin(np.pi*t)*(1. if problem.get('axialSeedWave',False) else np.sin(flat[ids[0],0]*.61))
                values.append(value)
                lower.append(problem['rootY'] if k==1 and sign>0 else -np.inf)
                upper.append(problem['rootY'] if k==1 and sign<0 else np.inf)
        base[ids]=p
    variable_nodes,variable_axes=np.where(lookup>=0)
    variable_ids=lookup[variable_nodes,variable_axes]
    edges=np.asarray([e['nodes'] for e in problem['edges']],int)
    rest=np.asarray([e['length'] for e in problem['edges']],float)
    a,b=edges[:,0],edges[:,1]
    rows=np.arange(len(edges))
    def positions(x):
        result=base.copy();result[variable_nodes,variable_axes]=x[variable_ids];return result
    def residual(x):
        p=positions(x);return (np.linalg.norm(p[a]-p[b],axis=1)-rest)/rest
    def jacobian(x):
        p=positions(x);d=p[a]-p[b];grad=d/np.maximum(np.linalg.norm(d,axis=1)[:,None],1e-15)/rest[:,None]
        rr,cc,vv=[],[],[]
        for ids,factor in [(a,1),(b,-1)]:
            for k in range(3):
                mask=lookup[ids,k]>=0
                rr.extend(rows[mask]);cc.extend(lookup[ids[mask],k]);vv.extend(factor*grad[mask,k])
        return coo_matrix((vv,(rr,cc)),shape=(len(edges),len(values))).tocsr()
    x=np.clip(np.asarray(values),np.asarray(lower)+1e-10,np.asarray(upper)-1e-10)
    def checkpoint(intermediate_result):
        if progress_callback and intermediate_result.nfev % 50 == 0:
            pp=positions(intermediate_result.x)
            progress_callback({'evaluations':int(intermediate_result.nfev),'maxRelativeEdgeError':float(np.max(np.abs(residual(intermediate_result.x)))),'positionsMm':pp.tolist()})
    options={'tr_solver':'exact'} if problem.get('denseJacobian',False) else {'tr_options':{'atol':1e-12,'btol':1e-12,'maxiter':problem.get('lsmrIterations',1000)}}
    fit=least_squares(residual,x,jac=(lambda v:jacobian(v).toarray()) if problem.get('denseJacobian',False) else jacobian,bounds=(lower,upper),xtol=2e-14,ftol=2e-14,gtol=2e-14,max_nfev=max_evaluations,x_scale='jac',callback=checkpoint,**options)
    p=positions(fit.x);error=np.abs(np.linalg.norm(p[a]-p[b],axis=1)-rest)
    return {'frames':[{'progress':1,'positionsMm':p.tolist()}],'evaluations':int(fit.nfev),'optimizerSuccess':bool(fit.success),'maxEdgeErrorMm':float(error.max()),'maxRelativeEdgeError':float((error/rest).max()),'clampXYFixed':False,'selfContactVerified':False,'manufacturingReady':False}
