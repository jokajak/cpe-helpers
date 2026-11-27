"""Offline tests for the episode-specific CPE draft."""

import importlib.util
import io
import unittest
from pathlib import Path
from datetime import date
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("sn_cpe", Path(__file__).with_name("sn_cpe.py"))
sn_cpe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sn_cpe)


class EpisodeDraftTests(unittest.TestCase):
    def test_grc_description_selects_only_requested_episode(self):
        html = b"""
        <a name="1068"></a>
        <font size="1">Episode #1068 | 04 Mar 2026 | 49 min.</font>
        <font size="1"><font size="2">The Call is Coming from Inside the House</font>
        ThreadLocker Special: a discussion of least privilege security design
        at a Zero Trust conference.</font>
        <a name="1069"></a>
        <font size="1"><font size="2">You can't hide from LLMs</font>
        An unrelated next episode.</font>
        """
        row = {
            "episode": "1068",
            "title": "The Call is Coming from Inside the House",
            "archive_url": "https://www.grc.com/securitynow.htm",
        }
        with patch.object(sn_cpe, "urlopen", return_value=io.BytesIO(html)):
            description = sn_cpe.fetch_episode_description(row)
        self.assertIn("least privilege security design", description)
        self.assertNotIn("unrelated next episode", description)
        self.assertEqual(
            sn_cpe.choose_domain(row, description),
            "Identity and Access Management (IAM)",
        )
        summary = sn_cpe.build_summary(row, description)
        self.assertIn("ThreadLocker Special", summary)
        self.assertIn("least privilege", summary)
        self.assertNotIn("Published duration", summary)

    def test_missing_description_stops_instead_of_using_generic_text(self):
        row = {
            "episode": "1068",
            "title": "The Call is Coming from Inside the House",
            "archive_url": "https://www.grc.com/securitynow.htm",
        }
        with patch.object(sn_cpe, "urlopen", return_value=io.BytesIO(b'<a name="1068"></a>')):
            with self.assertRaisesRegex(sn_cpe.Stop, "no usable description"):
                sn_cpe.fetch_episode_description(row)


    def test_later_completed_window_can_become_eligible(self):
        class FutureDate(date):
            @classmethod
            def today(cls):
                return cls(2026, 12, 1)

        row = {
            "episode": "1105",
            "credential": "CISSP",
            "cpe_group": "Group A",
            "release_date": "2026-11-17",
            "title": "Formal Code Verification",
            "notes_or_evidence": "Estimated listening week was incomplete on 2026-11-25.",
            "estimated_listening_week_start": "2026-11-23",
            "estimated_listening_week_end": "2026-11-29",
            "published_duration_minutes": "142",
            "provisional_cpe_half_hours": "1.5",
        }
        with patch.object(sn_cpe, "date", FutureDate):
            _, end, credit = sn_cpe.details(row)
            self.assertEqual(str(end), "2026-11-29")
            self.assertEqual(credit, 1.5)
            row["published_duration_minutes"] = ""
            with self.assertRaisesRegex(sn_cpe.Stop, "duration or provisional credit is missing"):
                sn_cpe.details(row)



if __name__ == "__main__":
    unittest.main()
