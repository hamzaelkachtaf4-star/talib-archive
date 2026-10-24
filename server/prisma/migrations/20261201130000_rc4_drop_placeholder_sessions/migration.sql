-- RC4: earlier versions seeded seven invented sessions per student ("placeholder": Monday 08:30, 10:15, 14:00; Wednesday and
-- Thursday 08:30, 10:15). Remove only the ones nobody touched: still flagged, no subject or module, default kind, no room,
-- professor, group or dates, and exactly one of the seeded time slots. A session a student edited is never deleted.
DELETE FROM "LawTimetableSlot"
WHERE "placeholder" = 1 AND "subjectId" IS NULL AND "moduleId" IS NULL AND "kind" = 'amphi'
  AND "room" IS NULL AND "professor" IS NULL AND "groupLabel" IS NULL AND "activeFrom" IS NULL AND "activeTo" IS NULL
  AND (("weekday" = 1 AND "startTime" IN ('08:30', '10:15', '14:00') AND "endTime" IN ('10:00', '11:45', '15:30'))
    OR ("weekday" IN (3, 4) AND "startTime" IN ('08:30', '10:15') AND "endTime" IN ('10:00', '11:45')));
