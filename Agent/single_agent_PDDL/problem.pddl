(define (problem agentPRO)

    (:domain agentDOM)

    (:objects
        agent - agent
        p1 p2 p3 p4 p5 - parcel
        c1 c2 c3 c4 c5 c6 c7 c8 c9 c10 c11 c12 c13 c14 c15 c16 c17 - cell
    )

    (:init
        (at agent c1)
        (in p1 c11)
        (in p2 c12)

        (neighbourDown c1 c2)
        (neighbourUp c1 c2)

        (neighbourRigth c1 c3)
        (neighbourLeft c3 c1)

        (neighbourLeft c2 c4)
        (neighbourRigth c4 c2)

        (neighbourUp c3 c5)
        (neighbourDown c5 c3)

        (neighbourUp c5 c6)
        (neighbourDown c6 c5)

        (neighbourLeft c6 c7)
        (neighbourRigth c7 c6)

        (neighbourLeft c7 c8)
        (neighbourRigth c8 c7)

        (neighbourLeft c8 c9)
        (neighbourRigth c9 c8)

        (neighbourDown c9 c10)
        (neighbourUp c10 c9)

        (neighbourDown c10 c11)
        (neighbourUp c11 c10)

        (neighbourDown c11 c12)
        (neighbourUp c12 c11)

        (neighbourRigth c12 c4)
        (neighbourLeft c4 c12)

        (is-blocked c3)
        (is-delivery c4)
        (is-delivery c8)
    )

    (:goal
        (and
            (delivered p1)
            (delivered p2)
        )
    )
)