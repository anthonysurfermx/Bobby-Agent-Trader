"""Regression tests against disposable local PostgreSQL only; never production."""
from pathlib import Path
import json, subprocess, tempfile
PSQL = ['/opt/homebrew/bin/psql', '-h', '127.0.0.1', '-p', '55327', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1']
def sql(query):
    return subprocess.check_output(PSQL, input=query, text=True).strip()
migration = next(Path('supabase/bobby-protocol/supabase/migrations').glob('*_serialize_guest_network_quota.sql'))
sql(migration.read_text())
results = []
cases = [
    ('shared_network', 'null', "'device-' || :client_id || '-unique'", "'shared-network'", 15),
    ('same_device', 'null', "'same-device'", "'network-' || :client_id || '-unique'", 3),
    ('different_networks', 'null', "'device-' || :client_id || '-unique'", "'network-' || :client_id || '-unique'", 100),
    ('signed_in_free', "'11111111-1111-4111-8111-111111111111'::uuid", 'null', 'null', 10),
]
sql("insert into bobby_identities(id,auth_user_id) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222') on conflict do nothing;")
for name, identity, device, network, expected in cases:
    for repetition in range(3):
        sql('truncate bobby_reads;')
        with tempfile.NamedTemporaryFile(mode='w', suffix='.sql') as f:
            f.write(f"SELECT bobby_consume_read({identity}, {device}, {network}, 'ios', 'BTC', true);\n")
            f.flush()
            subprocess.run(['/opt/homebrew/bin/pgbench', '-h', '127.0.0.1', '-p', '55327', '-d', 'postgres', '-n', '-c', '100', '-j', '8', '-t', '1', '-f', f.name], capture_output=True, text=True, check=True)
        accepted = int(sql('select count(*) from bobby_reads;'))
        assert accepted == expected, (name, accepted, expected)
        results.append({'case':name,'repeat':repetition+1,'requests':100,'accepted':accepted,'expected':expected,'passed':True})
permissions = sql("select has_function_privilege('anon','bobby_consume_read(uuid,text,text,text,text,boolean)','execute'),has_function_privilege('authenticated','bobby_consume_read(uuid,text,text,text,text,boolean)','execute'),has_function_privilege('service_role','bobby_consume_read(uuid,text,text,text,text,boolean)','execute');")
assert permissions == 'f|f|t', permissions
output={'scope':'local PostgreSQL only; synthetic requests; production untouched', 'cases':results, 'execute_permissions':permissions}
Path('docs/audits/subscription-readiness-2026-09-30/quota-regression.json').write_text(json.dumps(output,indent=2))
print(json.dumps(output,indent=2))
