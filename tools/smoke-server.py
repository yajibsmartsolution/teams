import subprocess,tempfile,os,time,json,http.client,socket
from urllib.parse import urlparse
from pathlib import Path
root=str(Path(__file__).resolve().parents[1] / 'backend')
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
with tempfile.TemporaryDirectory() as data:
 env={**os.environ,'PORT':str(port),'NODE_ENV':'development','KEDCO_LOCAL_DATA_ROOT':data,'KEDCO_SETUP_TOKEN':'q'*40,'CORS_ORIGIN':f'http://127.0.0.1:{port}'}
 p=subprocess.Popen(['node','dist/server.js'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 def req(method,path,body=None,headers=None):
  conn=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
  try:
   payload=None if body is None else json.dumps(body).encode()
   conn.request(method,path,payload,{'Content-Type':'application/json',**(headers or {})})
   response=conn.getresponse();return response.status,dict(response.getheaders()),response.read()
  finally:conn.close()
 try:
  for _ in range(40):
   if p.poll()!=None:raise Exception('process stopped: '+p.stderr.read().decode()[:500])
   try:status,head,body=req('GET','/health');break
   except (OSError,TimeoutError):time.sleep(.15)
  assert status==200,(status,body[:500]);print('PASS /health 200')
  status,head,body=req('GET','/');assert status==200 and b'KEDCO Technical Automation' in body;print('PASS / 200 index.html')
  status,head,body=req('GET','/pages/tmo/analyzer.html');assert status==302 and head.get('Location')=='/',(status,head);print('PASS dashboard authentication gate')
  status,head,body=req('POST','/api/auth/setup',{'email':'admin@example.com','password':'LongTestPassword1234'});assert status==403,(status,body);print('PASS unauthorized first-admin setup blocked')
  status,head,body=req('POST','/api/auth/setup',{'email':'admin@example.com','password':'LongTestPassword1234'},{'x-kedco-setup-token':'q'*40});assert status==200,(status,body);print('PASS authorized first-admin setup')
  status,head,body=req('POST','/api/auth/login',{'email':'admin@example.com','password':'LongTestPassword1234'});assert status==200,(status,body);assert 'Set-Cookie' in head,(head,); token=head['Set-Cookie'].split(';')[0];print('PASS /api/auth/login and HttpOnly dashboard cookie')
  status,head,body=req('GET','/pages/tmo/analyzer.html',headers={'Cookie':token});assert status==200 and len(body)>500000,(status,len(body));print('PASS analyzer.html signed-in 200')
  status,head,body=req('GET','/assets/kedco-landing-slide-01.png');assert status==200 and len(body)>1000000,(status,len(body));print('PASS static asset HTTP 200')
  status,head,body=req('GET','/api/local/tables/kedco_data_snapshots');assert status==401,(status,body);print('PASS API table rejects anonymous access')
  print('ALL SERVER SMOKE TESTS PASS')
 finally:
  p.terminate()
  p.wait(timeout=5)
