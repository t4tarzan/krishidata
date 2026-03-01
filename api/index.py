"""
KrishiData API — Field Data Collection Platform
Vercel Python Serverless Function (catch-all handler)

All API routes are handled here. The DB lives in /tmp/ (ephemeral per cold start)
and is re-seeded automatically on each cold start — perfect for a demo.
"""

from http.server import BaseHTTPRequestHandler
import json
import sqlite3
import hashlib
import math
import re
from datetime import datetime
from collections import defaultdict
from urllib.parse import urlparse, parse_qs, unquote


# ============================================
# DATABASE SETUP
# ============================================

DB_PATH = "/tmp/krishidata.db"

def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    return db

def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','manager','supervisor','worker')),
            region TEXT DEFAULT '',
            area TEXT DEFAULT '',
            status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS forms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            fields_json TEXT NOT NULL DEFAULT '[]',
            created_by INTEGER REFERENCES users(id),
            status TEXT DEFAULT 'active' CHECK(status IN ('active','archived')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            form_id INTEGER NOT NULL REFERENCES forms(id),
            submitted_by INTEGER NOT NULL REFERENCES users(id),
            data_json TEXT NOT NULL DEFAULT '{}',
            location_lat REAL DEFAULT 0,
            location_lng REAL DEFAULT 0,
            location_name TEXT DEFAULT '',
            synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS vectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            field_name TEXT NOT NULL,
            field_value TEXT NOT NULL,
            tfidf_vector TEXT NOT NULL DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS correlations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            field_a TEXT NOT NULL,
            field_b TEXT NOT NULL,
            correlation_score REAL NOT NULL,
            sample_size INTEGER NOT NULL,
            pattern_description TEXT DEFAULT '',
            discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_submissions_form ON submissions(form_id);
        CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(submitted_by);
        CREATE INDEX IF NOT EXISTS idx_vectors_submission ON vectors(submission_id);
    """)

    # Seed data if empty
    user_count = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if user_count == 0:
        seed_data(db)

    db.commit()
    db.close()


def hash_password(pw):
    return hashlib.sha256(pw.encode('utf-8')).hexdigest()


def seed_data(db):
    """Create default users and sample data."""
    users = [
        ("admin", hash_password("admin123"), "Rajesh Kumar", "admin", "All", "All"),
        ("mgr_north", hash_password("pass123"), "Priya Sharma", "manager", "North", ""),
        ("mgr_south", hash_password("pass123"), "Arun Nair", "manager", "South", ""),
        ("sup_delhi", hash_password("pass123"), "Vikram Singh", "supervisor", "North", "Delhi NCR"),
        ("sup_chennai", hash_password("pass123"), "Lakshmi Iyer", "supervisor", "South", "Chennai"),
        ("fw_ravi", hash_password("pass123"), "Ravi Patel", "worker", "North", "Delhi NCR"),
        ("fw_meena", hash_password("pass123"), "Meena Devi", "worker", "North", "Delhi NCR"),
        ("fw_kumar", hash_password("pass123"), "Kumar Swamy", "worker", "South", "Chennai"),
    ]
    db.executemany(
        "INSERT INTO users (username, password_hash, full_name, role, region, area) VALUES (?,?,?,?,?,?)",
        users
    )

    # Sample form: Crop Survey
    crop_fields = json.dumps([
        {"id": "f1", "label": "Farmer Name", "type": "text", "required": True, "options": []},
        {"id": "f2", "label": "Village", "type": "text", "required": True, "options": []},
        {"id": "f3", "label": "Crop Type", "type": "select", "required": True,
         "options": ["Rice", "Wheat", "Sugarcane", "Cotton", "Pulses", "Vegetables", "Fruits"]},
        {"id": "f4", "label": "Land Area (acres)", "type": "number", "required": True, "options": []},
        {"id": "f5", "label": "Irrigation Type", "type": "select", "required": True,
         "options": ["Canal", "Borewell", "Rain-fed", "Drip", "Sprinkler"]},
        {"id": "f6", "label": "Soil Quality", "type": "rating", "required": False, "options": []},
        {"id": "f7", "label": "Yield (quintals)", "type": "number", "required": False, "options": []},
        {"id": "f8", "label": "Problems Faced", "type": "textarea", "required": False, "options": []},
        {"id": "f9", "label": "Uses Fertilizer", "type": "checkbox", "required": False, "options": []},
        {"id": "f10", "label": "Survey Date", "type": "date", "required": True, "options": []},
    ])
    db.execute(
        "INSERT INTO forms (name, description, fields_json, created_by, status) VALUES (?,?,?,?,?)",
        ("Crop Survey 2026", "Comprehensive crop and farmer data collection for Kharif season", crop_fields, 1, "active")
    )

    # Sample form: Village Infrastructure
    infra_fields = json.dumps([
        {"id": "g1", "label": "Village Name", "type": "text", "required": True, "options": []},
        {"id": "g2", "label": "District", "type": "text", "required": True, "options": []},
        {"id": "g3", "label": "Road Condition", "type": "select", "required": True,
         "options": ["Paved - Good", "Paved - Damaged", "Unpaved - Usable", "Unpaved - Poor", "No Road"]},
        {"id": "g4", "label": "Distance to Market (km)", "type": "number", "required": True, "options": []},
        {"id": "g5", "label": "Water Access", "type": "select", "required": True,
         "options": ["Piped Water", "Handpump", "Well", "River/Pond", "No Access"]},
        {"id": "g6", "label": "Electricity Hours/Day", "type": "number", "required": False, "options": []},
        {"id": "g7", "label": "Mobile Coverage", "type": "select", "required": False,
         "options": ["4G", "3G", "2G", "No Coverage"]},
        {"id": "g8", "label": "Infrastructure Rating", "type": "rating", "required": False, "options": []},
        {"id": "g9", "label": "Notes", "type": "textarea", "required": False, "options": []},
    ])
    db.execute(
        "INSERT INTO forms (name, description, fields_json, created_by, status) VALUES (?,?,?,?,?)",
        ("Village Infrastructure Audit", "Assess basic infrastructure availability in rural areas", infra_fields, 1, "active")
    )

    # Sample submissions for Crop Survey
    crop_submissions = [
        (1, 6, json.dumps({"f1": "Ramesh Yadav", "f2": "Chandpur", "f3": "Rice", "f4": "5.5", "f5": "Canal", "f6": "4", "f7": "22", "f8": "Water shortage in late season", "f9": "true", "f10": "2026-02-15"}), 28.6139, 77.2090, "Chandpur, Delhi NCR"),
        (1, 6, json.dumps({"f1": "Sunita Devi", "f2": "Bahadurgarh", "f3": "Wheat", "f4": "3.0", "f5": "Borewell", "f6": "3", "f7": "12", "f8": "Pest attack in January", "f9": "true", "f10": "2026-02-16"}), 28.6820, 76.9350, "Bahadurgarh, Haryana"),
        (1, 7, json.dumps({"f1": "Mohan Singh", "f2": "Narela", "f3": "Sugarcane", "f4": "8.0", "f5": "Canal", "f6": "5", "f7": "45", "f8": "", "f9": "true", "f10": "2026-02-17"}), 28.8527, 77.0926, "Narela, Delhi"),
        (1, 7, json.dumps({"f1": "Geeta Rani", "f2": "Sonipat", "f3": "Vegetables", "f4": "1.5", "f5": "Drip", "f6": "4", "f7": "8", "f8": "Market price too low for tomatoes", "f9": "false", "f10": "2026-02-18"}), 28.9931, 77.0151, "Sonipat, Haryana"),
        (1, 8, json.dumps({"f1": "Anbu Selvan", "f2": "Kanchipuram", "f3": "Rice", "f4": "4.0", "f5": "Canal", "f6": "3", "f7": "18", "f8": "Late monsoon delayed planting", "f9": "true", "f10": "2026-02-19"}), 12.8342, 79.7036, "Kanchipuram, Tamil Nadu"),
        (1, 8, json.dumps({"f1": "Lakshmi Ammal", "f2": "Thiruvannamalai", "f3": "Pulses", "f4": "2.5", "f5": "Rain-fed", "f6": "2", "f7": "5", "f8": "Drought conditions, poor yield", "f9": "false", "f10": "2026-02-20"}), 12.2253, 79.0747, "Thiruvannamalai, TN"),
        (1, 6, json.dumps({"f1": "Harpal Singh", "f2": "Ghaziabad", "f3": "Wheat", "f4": "6.0", "f5": "Borewell", "f6": "4", "f7": "28", "f8": "Good yield this season", "f9": "true", "f10": "2026-02-21"}), 28.6692, 77.4538, "Ghaziabad, UP"),
        (1, 8, json.dumps({"f1": "Murugan K", "f2": "Madurai", "f3": "Cotton", "f4": "7.0", "f5": "Sprinkler", "f6": "3", "f7": "15", "f8": "Bollworm infestation", "f9": "true", "f10": "2026-02-22"}), 9.9252, 78.1198, "Madurai, Tamil Nadu"),
        (1, 7, json.dumps({"f1": "Premlata", "f2": "Rohtak", "f3": "Rice", "f4": "4.5", "f5": "Canal", "f6": "4", "f7": "20", "f8": "", "f9": "true", "f10": "2026-02-23"}), 28.8955, 76.5796, "Rohtak, Haryana"),
        (1, 6, json.dumps({"f1": "Baldev Raj", "f2": "Meerut", "f3": "Sugarcane", "f4": "10.0", "f5": "Canal", "f6": "5", "f7": "55", "f8": "Excellent irrigation this year", "f9": "true", "f10": "2026-02-24"}), 28.9845, 77.7064, "Meerut, UP"),
    ]
    for sub in crop_submissions:
        db.execute(
            "INSERT INTO submissions (form_id, submitted_by, data_json, location_lat, location_lng, location_name) VALUES (?,?,?,?,?,?)",
            sub
        )

    # Sample submissions for Infrastructure
    infra_submissions = [
        (2, 6, json.dumps({"g1": "Chandpur", "g2": "South Delhi", "g3": "Paved - Good", "g4": "3", "g5": "Piped Water", "g6": "20", "g7": "4G", "g8": "4", "g9": "Well connected village"}), 28.6139, 77.2090, "Chandpur"),
        (2, 7, json.dumps({"g1": "Narela", "g2": "North Delhi", "g3": "Paved - Damaged", "g4": "8", "g5": "Handpump", "g6": "14", "g7": "3G", "g8": "2", "g9": "Road needs repair, water supply intermittent"}), 28.8527, 77.0926, "Narela"),
        (2, 8, json.dumps({"g1": "Kanchipuram Rural", "g2": "Kanchipuram", "g3": "Unpaved - Usable", "g4": "12", "g5": "Well", "g6": "8", "g7": "2G", "g8": "2", "g9": "Remote area, poor connectivity"}), 12.8342, 79.7036, "Kanchipuram"),
        (2, 8, json.dumps({"g1": "Thiruvannamalai East", "g2": "Thiruvannamalai", "g3": "Unpaved - Poor", "g4": "20", "g5": "River/Pond", "g6": "6", "g7": "No Coverage", "g8": "1", "g9": "Very remote, no mobile signal, needs urgent attention"}), 12.2253, 79.0747, "Thiruvannamalai"),
    ]
    for sub in infra_submissions:
        db.execute(
            "INSERT INTO submissions (form_id, submitted_by, data_json, location_lat, location_lng, location_name) VALUES (?,?,?,?,?,?)",
            sub
        )

    db.commit()

    # Build TF-IDF vectors for all seeded submissions
    build_vectors_for_all(db)


# ============================================
# TF-IDF VECTOR ENGINE
# ============================================

def tokenize(text):
    """Simple tokenizer: lowercase, split on non-alpha, remove short words."""
    text = str(text).lower()
    tokens = re.findall(r'[a-z]+', text)
    return [t for t in tokens if len(t) > 1]


def compute_tfidf(documents):
    """Compute TF-IDF vectors for a list of (doc_id, text) tuples.
    Returns {doc_id: {term: tfidf_score}}."""
    doc_tokens = {}
    df = defaultdict(int)
    vocab = set()

    for doc_id, text in documents:
        tokens = tokenize(text)
        doc_tokens[doc_id] = tokens
        unique_tokens = set(tokens)
        for t in unique_tokens:
            df[t] += 1
        vocab.update(unique_tokens)

    N = len(documents)
    if N == 0:
        return {}

    result = {}
    for doc_id, tokens in doc_tokens.items():
        if not tokens:
            result[doc_id] = {}
            continue
        tf = defaultdict(int)
        for t in tokens:
            tf[t] += 1
        max_tf = max(tf.values()) if tf else 1
        tfidf = {}
        for term, count in tf.items():
            tf_val = 0.5 + 0.5 * (count / max_tf)
            idf_val = math.log((N + 1) / (df.get(term, 0) + 1)) + 1
            tfidf[term] = round(tf_val * idf_val, 6)
        result[doc_id] = tfidf
    return result


def cosine_similarity(vec_a, vec_b):
    """Cosine similarity between two sparse vectors (dicts)."""
    common = set(vec_a.keys()) & set(vec_b.keys())
    if not common:
        return 0.0
    dot = sum(vec_a[k] * vec_b[k] for k in common)
    norm_a = math.sqrt(sum(v * v for v in vec_a.values()))
    norm_b = math.sqrt(sum(v * v for v in vec_b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def build_vectors_for_submission(db, submission_id):
    """Build TF-IDF vectors for a single submission."""
    row = db.execute("SELECT * FROM submissions WHERE id=?", [submission_id]).fetchone()
    if not row:
        return
    data = json.loads(row["data_json"])
    # Delete old vectors
    db.execute("DELETE FROM vectors WHERE submission_id=?", [submission_id])

    # Get all docs for IDF calculation
    all_subs = db.execute("SELECT id, data_json FROM submissions").fetchall()
    all_texts = []
    for s in all_subs:
        d = json.loads(s["data_json"])
        combined = " ".join(str(v) for v in d.values())
        all_texts.append((s["id"], combined))

    tfidf_all = compute_tfidf(all_texts)

    # Store vectors per field
    for field_name, field_value in data.items():
        val_str = str(field_value)
        if not val_str.strip():
            continue
        vec = tfidf_all.get(submission_id, {})
        db.execute(
            "INSERT INTO vectors (submission_id, field_name, field_value, tfidf_vector) VALUES (?,?,?,?)",
            [submission_id, field_name, val_str, json.dumps(vec)]
        )
    db.commit()


def build_vectors_for_all(db):
    """Build TF-IDF vectors for all submissions."""
    db.execute("DELETE FROM vectors")
    all_subs = db.execute("SELECT id, data_json FROM submissions").fetchall()
    if not all_subs:
        return

    all_texts = []
    for s in all_subs:
        d = json.loads(s["data_json"])
        combined = " ".join(str(v) for v in d.values())
        all_texts.append((s["id"], combined))

    tfidf_all = compute_tfidf(all_texts)

    for s in all_subs:
        data = json.loads(s["data_json"])
        vec = tfidf_all.get(s["id"], {})
        for field_name, field_value in data.items():
            val_str = str(field_value)
            if not val_str.strip():
                continue
            db.execute(
                "INSERT INTO vectors (submission_id, field_name, field_value, tfidf_vector) VALUES (?,?,?,?)",
                [s["id"], field_name, val_str, json.dumps(vec)]
            )
    db.commit()


# ============================================
# CORRELATION ENGINE
# ============================================

def discover_correlations(db):
    """Analyze field pairs across submissions and discover patterns."""
    db.execute("DELETE FROM correlations")
    all_subs = db.execute("SELECT id, form_id, data_json FROM submissions").fetchall()
    if len(all_subs) < 3:
        db.commit()
        return []

    # Group submissions by form
    form_subs = defaultdict(list)
    for s in all_subs:
        form_subs[s["form_id"]].append(json.loads(s["data_json"]))

    correlations_found = []

    for form_id, submissions_data in form_subs.items():
        if len(submissions_data) < 3:
            continue

        # Get all field names
        field_names = set()
        for d in submissions_data:
            field_names.update(d.keys())
        field_names = sorted(field_names)

        # Classify fields
        field_types = {}
        for fname in field_names:
            values = [d.get(fname, "") for d in submissions_data if d.get(fname, "")]
            if not values:
                field_types[fname] = "empty"
                continue
            numeric_count = 0
            for v in values:
                try:
                    float(str(v).replace(",", ""))
                    numeric_count += 1
                except Exception:
                    pass
            if numeric_count > len(values) * 0.7:
                field_types[fname] = "numeric"
            else:
                field_types[fname] = "categorical"

        # Analyze pairs
        for i in range(len(field_names)):
            for j in range(i + 1, len(field_names)):
                fa, fb = field_names[i], field_names[j]
                ta, tb = field_types.get(fa, "empty"), field_types.get(fb, "empty")
                if ta == "empty" or tb == "empty":
                    continue

                vals_a = []
                vals_b = []
                for d in submissions_data:
                    va, vb = d.get(fa, ""), d.get(fb, "")
                    if va and vb:
                        vals_a.append(va)
                        vals_b.append(vb)

                if len(vals_a) < 3:
                    continue

                score = 0.0
                description = ""

                if ta == "numeric" and tb == "numeric":
                    score, description = numeric_numeric_corr(fa, fb, vals_a, vals_b)
                elif ta == "categorical" and tb == "numeric":
                    score, description = categorical_numeric_corr(fa, fb, vals_a, vals_b)
                elif ta == "numeric" and tb == "categorical":
                    score, description = categorical_numeric_corr(fb, fa, vals_b, vals_a)
                elif ta == "categorical" and tb == "categorical":
                    score, description = categorical_categorical_corr(fa, fb, vals_a, vals_b)

                if abs(score) >= 0.15:
                    correlations_found.append({
                        "field_a": fa,
                        "field_b": fb,
                        "score": round(score, 4),
                        "sample_size": len(vals_a),
                        "description": description
                    })
                    db.execute(
                        "INSERT INTO correlations (field_a, field_b, correlation_score, sample_size, pattern_description) VALUES (?,?,?,?,?)",
                        [fa, fb, round(score, 4), len(vals_a), description]
                    )

    db.commit()
    return correlations_found


def numeric_numeric_corr(fa, fb, vals_a, vals_b):
    """Pearson correlation for two numeric fields."""
    try:
        nums_a = [float(str(v).replace(",", "")) for v in vals_a]
        nums_b = [float(str(v).replace(",", "")) for v in vals_b]
    except Exception:
        return 0.0, ""

    n = len(nums_a)
    if n < 3:
        return 0.0, ""

    mean_a = sum(nums_a) / n
    mean_b = sum(nums_b) / n

    cov = sum((nums_a[i] - mean_a) * (nums_b[i] - mean_b) for i in range(n))
    std_a = math.sqrt(sum((x - mean_a) ** 2 for x in nums_a))
    std_b = math.sqrt(sum((x - mean_b) ** 2 for x in nums_b))

    if std_a == 0 or std_b == 0:
        return 0.0, ""

    r = cov / (std_a * std_b)

    strength = "strong" if abs(r) > 0.7 else "moderate" if abs(r) > 0.4 else "weak"
    direction = "positive" if r > 0 else "negative"
    desc = f"{strength.title()} {direction} correlation: as {fa} increases, {fb} {'increases' if r > 0 else 'decreases'}"
    return r, desc


def categorical_numeric_corr(cat_field, num_field, cat_vals, num_vals):
    """Correlation between categorical and numeric field using eta-squared."""
    try:
        nums = [float(str(v).replace(",", "")) for v in num_vals]
    except Exception:
        return 0.0, ""

    groups = defaultdict(list)
    for i, c in enumerate(cat_vals):
        groups[str(c)].append(nums[i])

    if len(groups) < 2:
        return 0.0, ""

    grand_mean = sum(nums) / len(nums)
    ss_between = sum(len(g) * (sum(g) / len(g) - grand_mean) ** 2 for g in groups.values())
    ss_total = sum((x - grand_mean) ** 2 for x in nums)

    if ss_total == 0:
        return 0.0, ""

    eta_sq = ss_between / ss_total

    group_means = {k: sum(v) / len(v) for k, v in groups.items()}
    high_group = max(group_means, key=group_means.get)
    low_group = min(group_means, key=group_means.get)

    strength = "strong" if eta_sq > 0.25 else "moderate" if eta_sq > 0.1 else "weak"
    desc = (
        f"{strength.title()} association: {cat_field}='{high_group}' has highest avg {num_field} "
        f"({group_means[high_group]:.1f}), '{low_group}' has lowest ({group_means[low_group]:.1f})"
    )
    return eta_sq, desc


def categorical_categorical_corr(fa, fb, vals_a, vals_b):
    """Association between two categorical fields using Cram\u00e9r's V."""
    contingency = defaultdict(lambda: defaultdict(int))
    for i in range(len(vals_a)):
        contingency[str(vals_a[i])][str(vals_b[i])] += 1

    rows = list(contingency.keys())
    cols = set()
    for r in rows:
        cols.update(contingency[r].keys())
    cols = list(cols)

    if len(rows) < 2 or len(cols) < 2:
        return 0.0, ""

    n = len(vals_a)
    row_totals = {r: sum(contingency[r].values()) for r in rows}
    col_totals = {c: sum(contingency[r][c] for r in rows) for c in cols}

    chi2 = 0
    for r in rows:
        for c in cols:
            observed = contingency[r][c]
            expected = (row_totals[r] * col_totals[c]) / n if n > 0 else 0
            if expected > 0:
                chi2 += (observed - expected) ** 2 / expected

    k = min(len(rows), len(cols))
    if k <= 1 or n <= 0:
        return 0.0, ""

    v = math.sqrt(chi2 / (n * (k - 1))) if n * (k - 1) > 0 else 0

    max_pair = ("", "", 0)
    for r in rows:
        for c in cols:
            if contingency[r][c] > max_pair[2]:
                max_pair = (r, c, contingency[r][c])

    strength = "strong" if v > 0.5 else "moderate" if v > 0.25 else "weak"
    desc = (
        f"{strength.title()} association between {fa} and {fb}. "
        f"Most common pair: {fa}='{max_pair[0]}' with {fb}='{max_pair[1]}' ({max_pair[2]} occurrences)"
    )
    return v, desc


# ============================================
# RBAC HELPERS
# ============================================

def check_auth_user(db, user_id):
    """Look up an active user by ID."""
    if not user_id:
        return None
    try:
        user = db.execute(
            "SELECT * FROM users WHERE id=? AND status='active'", [int(user_id)]
        ).fetchone()
        return dict(user) if user else None
    except Exception:
        return None


def can_access_submission(user, submission, db):
    """Check if user can access a specific submission."""
    role = user["role"]
    if role == "admin":
        return True

    sub_user = db.execute("SELECT * FROM users WHERE id=?", [submission["submitted_by"]]).fetchone()
    if not sub_user:
        return False

    if role == "manager":
        return sub_user["region"] == user["region"]
    elif role == "supervisor":
        return sub_user["area"] == user["area"]
    elif role == "worker":
        return submission["submitted_by"] == user["id"]
    return False


def can_manage_user(actor, target_role):
    """Check if actor can create/edit users of target_role."""
    hierarchy = {"admin": 4, "manager": 3, "supervisor": 2, "worker": 1}
    return hierarchy.get(actor["role"], 0) > hierarchy.get(target_role, 0) or actor["role"] == "admin"


# ============================================
# RESPONSE HELPERS
# ============================================

def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows):
    return [dict(r) for r in rows]


# ============================================
# ROUTE HANDLERS
# ============================================

def handle_auth_login(db, method, params, body):
    if method != "POST":
        return 405, {"error": "Method not allowed"}

    username = body.get("username", "")
    password = body.get("password", "")

    if not username or not password:
        return 400, {"error": "Username and password required"}

    pw_hash = hash_password(password)
    user = db.execute(
        "SELECT * FROM users WHERE username=? AND password_hash=? AND status='active'",
        [username, pw_hash]
    ).fetchone()

    if not user:
        return 401, {"error": "Invalid credentials"}

    user_dict = dict(user)
    del user_dict["password_hash"]
    return 200, {"user": user_dict, "message": "Login successful"}


def handle_users(db, method, params, body, user):
    if not user:
        return 401, {"error": "Unauthorized"}

    user_id_param = params.get("id")

    if method == "GET":
        if user_id_param:
            target = db.execute(
                "SELECT id, username, full_name, role, region, area, status, created_at FROM users WHERE id=?",
                [user_id_param]
            ).fetchone()
            if not target:
                return 404, {"error": "User not found"}
            return 200, row_to_dict(target)

        if user["role"] == "admin":
            users = db.execute(
                "SELECT id, username, full_name, role, region, area, status, created_at FROM users ORDER BY id"
            ).fetchall()
        elif user["role"] == "manager":
            users = db.execute(
                "SELECT id, username, full_name, role, region, area, status, created_at FROM users "
                "WHERE region=? AND role IN ('supervisor','worker') ORDER BY id",
                [user["region"]]
            ).fetchall()
        elif user["role"] == "supervisor":
            users = db.execute(
                "SELECT id, username, full_name, role, region, area, status, created_at FROM users "
                "WHERE area=? AND role='worker' ORDER BY id",
                [user["area"]]
            ).fetchall()
        else:
            return 403, {"error": "Access denied"}

        return 200, {"users": rows_to_list(users)}

    elif method == "POST":
        if user["role"] not in ("admin", "manager"):
            return 403, {"error": "Access denied"}

        required = ["username", "password", "full_name", "role"]
        for f in required:
            if not body.get(f):
                return 400, {"error": f"{f} is required"}

        if not can_manage_user(user, body["role"]):
            return 403, {"error": "Cannot create user with that role"}

        try:
            db.execute(
                "INSERT INTO users (username, password_hash, full_name, role, region, area) VALUES (?,?,?,?,?,?)",
                [body["username"], hash_password(body["password"]), body["full_name"],
                 body["role"], body.get("region", ""), body.get("area", "")]
            )
            db.commit()
            new_user = db.execute(
                "SELECT id, username, full_name, role, region, area, status, created_at FROM users WHERE username=?",
                [body["username"]]
            ).fetchone()
            return 201, row_to_dict(new_user)
        except sqlite3.IntegrityError:
            return 400, {"error": "Username already exists"}

    elif method == "PUT":
        if not user_id_param:
            return 400, {"error": "User ID required"}

        target = db.execute("SELECT * FROM users WHERE id=?", [user_id_param]).fetchone()
        if not target:
            return 404, {"error": "User not found"}

        if user["role"] != "admin" and not can_manage_user(user, target["role"]):
            return 403, {"error": "Access denied"}

        updates = []
        values = []
        for field in ["full_name", "role", "region", "area", "status"]:
            if field in body:
                updates.append(f"{field}=?")
                values.append(body[field])
        if "password" in body and body["password"]:
            updates.append("password_hash=?")
            values.append(hash_password(body["password"]))

        if updates:
            values.append(user_id_param)
            db.execute(f"UPDATE users SET {','.join(updates)} WHERE id=?", values)
            db.commit()

        updated = db.execute(
            "SELECT id, username, full_name, role, region, area, status, created_at FROM users WHERE id=?",
            [user_id_param]
        ).fetchone()
        return 200, row_to_dict(updated)

    elif method == "DELETE":
        if user["role"] != "admin":
            return 403, {"error": "Admin only"}
        if not user_id_param:
            return 400, {"error": "User ID required"}
        db.execute("UPDATE users SET status='inactive' WHERE id=?", [user_id_param])
        db.commit()
        return 200, {"message": "User deactivated"}

    return 405, {"error": "Method not allowed"}


def handle_forms(db, method, params, body, user):
    if not user:
        return 401, {"error": "Unauthorized"}

    form_id = params.get("id")

    if method == "GET":
        if form_id:
            form = db.execute("SELECT * FROM forms WHERE id=?", [form_id]).fetchone()
            if not form:
                return 404, {"error": "Form not found"}
            f = dict(form)
            f["fields"] = json.loads(f["fields_json"])
            creator = db.execute("SELECT full_name FROM users WHERE id=?", [f["created_by"]]).fetchone()
            f["created_by_name"] = creator["full_name"] if creator else "Unknown"
            return 200, f

        status_filter = params.get("status", "active")
        if status_filter == "all":
            forms = db.execute("SELECT * FROM forms ORDER BY updated_at DESC").fetchall()
        else:
            forms = db.execute(
                "SELECT * FROM forms WHERE status=? ORDER BY updated_at DESC", [status_filter]
            ).fetchall()

        result = []
        for f in forms:
            fd = dict(f)
            fd["fields"] = json.loads(fd["fields_json"])
            fd["field_count"] = len(fd["fields"])
            sub_count = db.execute("SELECT COUNT(*) FROM submissions WHERE form_id=?", [f["id"]]).fetchone()[0]
            fd["submission_count"] = sub_count
            result.append(fd)

        return 200, {"forms": result}

    elif method == "POST":
        if user["role"] not in ("admin", "manager"):
            return 403, {"error": "Access denied"}

        if not body.get("name"):
            return 400, {"error": "Form name required"}

        fields = body.get("fields", [])
        db.execute(
            "INSERT INTO forms (name, description, fields_json, created_by) VALUES (?,?,?,?)",
            [body["name"], body.get("description", ""), json.dumps(fields), user["id"]]
        )
        db.commit()
        new_form = db.execute("SELECT * FROM forms ORDER BY id DESC LIMIT 1").fetchone()
        f = dict(new_form)
        f["fields"] = json.loads(f["fields_json"])
        return 201, f

    elif method == "PUT":
        if user["role"] not in ("admin", "manager"):
            return 403, {"error": "Access denied"}
        if not form_id:
            return 400, {"error": "Form ID required"}

        form = db.execute("SELECT * FROM forms WHERE id=?", [form_id]).fetchone()
        if not form:
            return 404, {"error": "Form not found"}

        updates = []
        values = []
        for field in ["name", "description", "status"]:
            if field in body:
                updates.append(f"{field}=?")
                values.append(body[field])
        if "fields" in body:
            updates.append("fields_json=?")
            values.append(json.dumps(body["fields"]))

        updates.append("updated_at=CURRENT_TIMESTAMP")
        values.append(form_id)
        db.execute(f"UPDATE forms SET {','.join(updates)} WHERE id=?", values)
        db.commit()

        updated = db.execute("SELECT * FROM forms WHERE id=?", [form_id]).fetchone()
        f = dict(updated)
        f["fields"] = json.loads(f["fields_json"])
        return 200, f

    elif method == "DELETE":
        if user["role"] != "admin":
            return 403, {"error": "Admin only"}
        if not form_id:
            return 400, {"error": "Form ID required"}
        db.execute("UPDATE forms SET status='archived' WHERE id=?", [form_id])
        db.commit()
        return 200, {"message": "Form archived"}

    return 405, {"error": "Method not allowed"}


def handle_submissions(db, method, params, body, user):
    if not user:
        return 401, {"error": "Unauthorized"}

    sub_id = params.get("id")

    if method == "GET":
        if sub_id:
            sub = db.execute("SELECT * FROM submissions WHERE id=?", [sub_id]).fetchone()
            if not sub:
                return 404, {"error": "Submission not found"}
            sub_dict = dict(sub)
            if not can_access_submission(user, sub_dict, db):
                return 403, {"error": "Access denied"}
            sub_dict["data"] = json.loads(sub_dict["data_json"])
            submitter = db.execute(
                "SELECT full_name, username FROM users WHERE id=?", [sub_dict["submitted_by"]]
            ).fetchone()
            sub_dict["submitted_by_name"] = submitter["full_name"] if submitter else "Unknown"
            form = db.execute("SELECT name FROM forms WHERE id=?", [sub_dict["form_id"]]).fetchone()
            sub_dict["form_name"] = form["name"] if form else "Unknown"
            return 200, sub_dict

        form_id_filter = params.get("form_id")
        worker_filter = params.get("worker_id")
        limit = int(params.get("limit", "50"))
        offset = int(params.get("offset", "0"))

        query = (
            "SELECT s.*, u.full_name as submitted_by_name, f.name as form_name "
            "FROM submissions s "
            "LEFT JOIN users u ON s.submitted_by=u.id "
            "LEFT JOIN forms f ON s.form_id=f.id WHERE 1=1"
        )
        query_params = []

        if user["role"] == "worker":
            query += " AND s.submitted_by=?"
            query_params.append(user["id"])
        elif user["role"] == "supervisor":
            query += " AND s.submitted_by IN (SELECT id FROM users WHERE area=?)"
            query_params.append(user["area"])
        elif user["role"] == "manager":
            query += " AND s.submitted_by IN (SELECT id FROM users WHERE region=?)"
            query_params.append(user["region"])

        if form_id_filter:
            query += " AND s.form_id=?"
            query_params.append(form_id_filter)
        if worker_filter:
            query += " AND s.submitted_by=?"
            query_params.append(worker_filter)

        count_query = (
            "SELECT COUNT(*) FROM submissions s WHERE 1=1"
        )
        count_params = []
        if user["role"] == "worker":
            count_query += " AND s.submitted_by=?"
            count_params.append(user["id"])
        elif user["role"] == "supervisor":
            count_query += " AND s.submitted_by IN (SELECT id FROM users WHERE area=?)"
            count_params.append(user["area"])
        elif user["role"] == "manager":
            count_query += " AND s.submitted_by IN (SELECT id FROM users WHERE region=?)"
            count_params.append(user["region"])
        if form_id_filter:
            count_query += " AND s.form_id=?"
            count_params.append(form_id_filter)
        if worker_filter:
            count_query += " AND s.submitted_by=?"
            count_params.append(worker_filter)

        total = db.execute(count_query, count_params).fetchone()[0]

        query += " ORDER BY s.created_at DESC LIMIT ? OFFSET ?"
        query_params.extend([limit, offset])

        subs = db.execute(query, query_params).fetchall()
        result = []
        for s in subs:
            sd = dict(s)
            sd["data"] = json.loads(sd["data_json"])
            result.append(sd)

        return 200, {"submissions": result, "total": total, "limit": limit, "offset": offset}

    elif method == "POST":
        if not body.get("form_id"):
            return 400, {"error": "form_id required"}

        form = db.execute(
            "SELECT * FROM forms WHERE id=? AND status='active'", [body["form_id"]]
        ).fetchone()
        if not form:
            return 404, {"error": "Form not found or inactive"}

        data = body.get("data", {})
        db.execute(
            "INSERT INTO submissions (form_id, submitted_by, data_json, location_lat, location_lng, location_name) "
            "VALUES (?,?,?,?,?,?)",
            [body["form_id"], user["id"], json.dumps(data),
             body.get("location_lat", 0), body.get("location_lng", 0), body.get("location_name", "")]
        )
        db.commit()

        new_sub = db.execute("SELECT * FROM submissions ORDER BY id DESC LIMIT 1").fetchone()
        try:
            build_vectors_for_submission(db, new_sub["id"])
        except Exception:
            pass

        sd = dict(new_sub)
        sd["data"] = json.loads(sd["data_json"])
        return 201, sd

    elif method == "PUT":
        if not sub_id:
            return 400, {"error": "Submission ID required"}

        sub = db.execute("SELECT * FROM submissions WHERE id=?", [sub_id]).fetchone()
        if not sub:
            return 404, {"error": "Submission not found"}

        sub_dict = dict(sub)
        if user["role"] == "worker" and sub_dict["submitted_by"] != user["id"]:
            return 403, {"error": "Can only edit own submissions"}
        if not can_access_submission(user, sub_dict, db):
            return 403, {"error": "Access denied"}

        data = body.get("data")
        updates = ["updated_at=CURRENT_TIMESTAMP"]
        values = []

        if data is not None:
            updates.append("data_json=?")
            values.append(json.dumps(data))
        for field in ["location_lat", "location_lng", "location_name"]:
            if field in body:
                updates.append(f"{field}=?")
                values.append(body[field])

        values.append(sub_id)
        db.execute(f"UPDATE submissions SET {','.join(updates)} WHERE id=?", values)
        db.commit()

        try:
            build_vectors_for_submission(db, int(sub_id))
        except Exception:
            pass

        updated = db.execute("SELECT * FROM submissions WHERE id=?", [sub_id]).fetchone()
        sd = dict(updated)
        sd["data"] = json.loads(sd["data_json"])
        return 200, sd

    elif method == "DELETE":
        if user["role"] not in ("admin", "manager"):
            return 403, {"error": "Access denied"}
        if not sub_id:
            return 400, {"error": "Submission ID required"}
        db.execute("DELETE FROM vectors WHERE submission_id=?", [sub_id])
        db.execute("DELETE FROM submissions WHERE id=?", [sub_id])
        db.commit()
        return 200, {"message": "Submission deleted"}

    return 405, {"error": "Method not allowed"}


def handle_search(db, method, params, body, user):
    if not user:
        return 401, {"error": "Unauthorized"}

    query_text = params.get("q", "")
    if not query_text:
        return 400, {"error": "Search query (q) required"}

    query_tokens = tokenize(query_text)
    if not query_tokens:
        return 200, {"results": [], "query": query_text}

    all_vectors = db.execute("SELECT DISTINCT submission_id, tfidf_vector FROM vectors").fetchall()

    all_subs = db.execute("SELECT id, data_json FROM submissions").fetchall()
    all_texts = [
        (s["id"], " ".join(str(v) for v in json.loads(s["data_json"]).values()))
        for s in all_subs
    ]
    all_texts.append((-1, query_text))
    tfidf_all = compute_tfidf(all_texts)
    query_vec = tfidf_all.get(-1, {})

    if not query_vec:
        return 200, {"results": [], "query": query_text}

    scores = {}
    seen_subs = set()
    for v_row in all_vectors:
        sid = v_row["submission_id"]
        if sid in seen_subs:
            continue
        seen_subs.add(sid)
        try:
            vec = json.loads(v_row["tfidf_vector"])
            if isinstance(vec, dict):
                sim = cosine_similarity(query_vec, vec)
            else:
                continue
        except Exception:
            continue
        if sim > 0.01:
            scores[sid] = sim

    sorted_results = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:20]

    results = []
    for sid, score in sorted_results:
        sub = db.execute(
            "SELECT s.*, u.full_name as submitted_by_name, f.name as form_name "
            "FROM submissions s "
            "LEFT JOIN users u ON s.submitted_by=u.id "
            "LEFT JOIN forms f ON s.form_id=f.id "
            "WHERE s.id=?",
            [sid]
        ).fetchone()
        if sub:
            sd = dict(sub)
            if can_access_submission(user, sd, db):
                sd["data"] = json.loads(sd["data_json"])
                sd["relevance_score"] = round(score, 4)
                matching = []
                data = sd["data"]
                for fname, fval in data.items():
                    val_tokens = set(tokenize(str(fval)))
                    if val_tokens & set(query_tokens):
                        matching.append(fname)
                sd["matching_fields"] = matching
                results.append(sd)

    return 200, {"results": results, "query": query_text, "total": len(results)}


def handle_correlations(db, method, params, body, user):
    if not user:
        return 401, {"error": "Unauthorized"}

    correlations = db.execute(
        "SELECT * FROM correlations ORDER BY ABS(correlation_score) DESC"
    ).fetchall()
    result = [dict(c) for c in correlations]
    return 200, {"correlations": result}


def handle_correlations_discover(db, method, params, body, user):
    if not user:
        return 401, {"error": "Unauthorized"}
    if user["role"] not in ("admin", "manager"):
        return 403, {"error": "Access denied"}

    correlations = discover_correlations(db)
    return 200, {"correlations": correlations, "count": len(correlations), "message": "Discovery complete"}


def handle_stats(db, method, params, body, user):
    if not user:
        return 401, {"error": "Unauthorized"}

    total_submissions = db.execute("SELECT COUNT(*) FROM submissions").fetchone()[0]
    active_forms = db.execute("SELECT COUNT(*) FROM forms WHERE status='active'").fetchone()[0]
    active_workers = db.execute("SELECT COUNT(*) FROM users WHERE role='worker' AND status='active'").fetchone()[0]
    total_users = db.execute("SELECT COUNT(*) FROM users WHERE status='active'").fetchone()[0]

    areas = db.execute(
        "SELECT COUNT(DISTINCT location_name) FROM submissions WHERE location_name != ''"
    ).fetchone()[0]

    daily = db.execute("""
        SELECT DATE(created_at) as day, COUNT(*) as count
        FROM submissions
        WHERE created_at >= DATE('now', '-14 days')
        GROUP BY DATE(created_at)
        ORDER BY day
    """).fetchall()
    daily_data = [{"date": d["day"], "count": d["count"]} for d in daily]

    by_form = db.execute("""
        SELECT f.name, COUNT(s.id) as count
        FROM forms f LEFT JOIN submissions s ON f.id = s.form_id
        WHERE f.status = 'active'
        GROUP BY f.id
        ORDER BY count DESC
    """).fetchall()
    form_data = [{"name": f["name"], "count": f["count"]} for f in by_form]

    recent = db.execute("""
        SELECT s.id, s.form_id, s.created_at, s.location_name,
               u.full_name as submitted_by_name, f.name as form_name
        FROM submissions s
        LEFT JOIN users u ON s.submitted_by = u.id
        LEFT JOIN forms f ON s.form_id = f.id
        ORDER BY s.created_at DESC LIMIT 10
    """).fetchall()
    recent_list = rows_to_list(recent)

    top_workers = db.execute("""
        SELECT u.full_name, u.area, COUNT(s.id) as submission_count
        FROM users u LEFT JOIN submissions s ON u.id = s.submitted_by
        WHERE u.role = 'worker' AND u.status = 'active'
        GROUP BY u.id
        ORDER BY submission_count DESC LIMIT 5
    """).fetchall()
    workers_data = rows_to_list(top_workers)

    region_data = db.execute("""
        SELECT u.region, COUNT(s.id) as count
        FROM submissions s
        LEFT JOIN users u ON s.submitted_by = u.id
        WHERE u.region IS NOT NULL AND u.region != ''
        GROUP BY u.region
        ORDER BY count DESC
    """).fetchall()
    regions = rows_to_list(region_data)

    return 200, {
        "total_submissions": total_submissions,
        "active_forms": active_forms,
        "active_workers": active_workers,
        "total_users": total_users,
        "coverage_areas": areas,
        "daily_submissions": daily_data,
        "submissions_by_form": form_data,
        "recent_submissions": recent_list,
        "top_workers": workers_data,
        "region_breakdown": regions,
    }


# ============================================
# VERCEL SERVERLESS HANDLER
# ============================================

class handler(BaseHTTPRequestHandler):
    """Vercel Python serverless handler — must be named 'handler' (lowercase)."""

    def _parse_request(self):
        """Parse URL, query params, and route (strip /api prefix)."""
        parsed = urlparse(self.path)
        path = parsed.path

        # Strip /api prefix to get the internal route
        if path.startswith("/api"):
            path = path[4:]  # remove '/api'
        if not path:
            path = "/"

        # Parse query string
        qs = parse_qs(parsed.query, keep_blank_values=True)
        params = {k: unquote(v[0]) for k, v in qs.items()}

        return path.rstrip("/") or "/", params

    def _read_body(self):
        """Read and parse JSON body."""
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            raw = self.rfile.read(content_length)
            try:
                return json.loads(raw)
            except Exception:
                return {}
        return {}

    def _send_json(self, status, data):
        """Write JSON response."""
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _route(self, method, body=None):
        """Main router — initialises DB, resolves auth, dispatches to handler."""
        if body is None:
            body = {}

        # Ensure DB is initialised (no-op if tables already exist in this /tmp)
        try:
            init_db()
        except Exception as e:
            self._send_json(500, {"error": f"DB init failed: {str(e)}"})
            return

        path, params = self._parse_request()

        db = get_db()
        try:
            # Resolve authenticated user from query param or body
            user_id = params.get("user_id") or body.get("user_id")
            auth_user = check_auth_user(db, user_id)

            # Dispatch
            if path == "/auth/login":
                status, data = handle_auth_login(db, method, params, body)

            elif path.startswith("/users"):
                status, data = handle_users(db, method, params, body, auth_user)

            elif path.startswith("/forms"):
                status, data = handle_forms(db, method, params, body, auth_user)

            elif path.startswith("/submissions"):
                status, data = handle_submissions(db, method, params, body, auth_user)

            elif path == "/search":
                status, data = handle_search(db, method, params, body, auth_user)

            elif path == "/correlations/discover":
                status, data = handle_correlations_discover(db, method, params, body, auth_user)

            elif path == "/correlations":
                status, data = handle_correlations(db, method, params, body, auth_user)

            elif path == "/stats":
                status, data = handle_stats(db, method, params, body, auth_user)

            elif path == "/health":
                status, data = 200, {"status": "ok", "timestamp": datetime.now().isoformat()}

            else:
                status, data = 404, {"error": f"Route not found: {path}"}

        except Exception as e:
            status, data = 500, {"error": f"Internal server error: {str(e)}"}
        finally:
            db.close()

        self._send_json(status, data)

    # ---- HTTP method handlers ----

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        body = self._read_body()
        self._route("POST", body)

    def do_PUT(self):
        body = self._read_body()
        self._route("PUT", body)

    def do_DELETE(self):
        self._route("DELETE")

    def log_message(self, fmt, *args):
        # Suppress default stderr logging in Vercel environment
        pass
