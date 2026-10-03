"""Idempotent demo data: one client, one admin and a few freelancers. Demo password: demo12345."""

from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import FreelancerProfile, User

PW = "demo12345"
FREELANCERS = [
    ("Sofia Alvarez", "sofia@demo.locim", "Full-stack dev · React, Next.js, Node", ["React", "Next.js", "Node.js", "Tailwind"], 1500),
    ("Omar Haddad", "omar@demo.locim", "Restaurant & hospitality web specialist", ["Web Design", "WordPress", "SEO", "UI/UX"], 1000),
    ("Priya Lal", "priya@demo.locim", "Backend engineer · Python, FastAPI", ["Python", "FastAPI", "PostgreSQL", "Docker"], 1600),
    ("Victor Santos", "victor@demo.locim", "Mobile & web apps · React Native", ["React Native", "TypeScript", "React", "Firebase"], 1300),
]


def main() -> None:
    with SessionLocal() as db:
        if not db.scalar(select(User).where(User.email == "client@demo.locim")):
            db.add(User(name="Demo Client", email="client@demo.locim", password_hash=hash_password(PW),
                        role="CLIENT"))
        if not db.scalar(select(User).where(User.email == "admin@demo.locim")):
            db.add(User(name="LOCIM Admin", email="admin@demo.locim", password_hash=hash_password(PW), role="ADMIN"))
        for name, email, headline, skills, rate in FREELANCERS:
            if db.scalar(select(User).where(User.email == email)):
                continue
            u = User(name=name, email=email, password_hash=hash_password(PW), role="FREELANCER")
            u.profile = FreelancerProfile(headline=headline, skills=skills, hourly_rate=Decimal(rate),
                                          bio=headline, availability="available")
            db.add(u)
        db.commit()


if __name__ == "__main__":
    main()
