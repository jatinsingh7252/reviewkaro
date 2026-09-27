-- ============================================================
-- ReviewKaro — demo seed (schema.sql ke BAAD chalao)
-- Demo business (trial, 3 din) + 7 din ka sample tracking data.
-- ============================================================

do $$
declare
  b_id uuid;
  i int;
  r float;
  msgs text[] := array[
    'Billing me zyada time laga, please staff badhao.',
    'Appointment time pe doctor nahi mile.',
    'Waiting area me seating kam hai.'
  ];
begin
  insert into rk_businesses
    (slug, name, category, city, google_review_url, owner_phone, owner_email, plan, expires_at)
  values (
    'glow-grace', 'Glow & Grace Salon', 'Salon', 'Patna',
    'https://www.google.com/maps/search/?api=1&query=salon',
    '919835059241', 'demo@knownlabs.in', 'trial', now() + interval '3 days'
  )
  returning id into b_id;

  for i in 1..48 loop
    insert into rk_events (business_id, type, created_at)
    values (b_id, 'scan', now() - (random()*7 || ' days')::interval);
    r := random();
    if r < 0.75 then
      insert into rk_events (business_id, type, created_at)
      values (b_id, 'like', now() - (random()*7 || ' days')::interval);
      if random() < 0.85 then
        insert into rk_events (business_id, type, meta, created_at)
        values (b_id, 'generated',
                jsonb_build_object('via', case when random() < 0.7 then 'gemini' else 'template' end, 'lang', 'en'),
                now() - (random()*7 || ' days')::interval);
      end if;
      if random() < 0.60 then
        insert into rk_events (business_id, type, created_at)
        values (b_id, 'copied', now() - (random()*7 || ' days')::interval);
      end if;
      if random() < 0.45 then
        insert into rk_events (business_id, type, created_at)
        values (b_id, 'google_click', now() - (random()*7 || ' days')::interval);
      end if;
    else
      insert into rk_events (business_id, type, created_at)
      values (b_id, 'dislike', now() - (random()*7 || ' days')::interval);
      if random() < 0.70 then
        insert into rk_events (business_id, type, meta, created_at)
        values (b_id, 'feedback',
                jsonb_build_object('message', msgs[1 + floor(random()*3)::int]),
                now() - (random()*7 || ' days')::interval);
      end if;
    end if;
  end loop;
end;
$$;
