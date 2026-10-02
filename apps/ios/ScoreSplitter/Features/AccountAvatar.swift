import SwiftUI

struct AccountAvatar: View {
    let profile: AccountProfile?
    let size: CGFloat

    var body: some View {
        AsyncImage(url: profile?.photoURL) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                ZStack {
                    Palette.accent.opacity(0.12)
                    if let initial = profile?.initial {
                        Text(initial).font(.system(size: size * 0.4, weight: .semibold))
                    } else {
                        Image(systemName: "person.fill").font(.system(size: size * 0.45))
                    }
                }.foregroundStyle(Palette.accent)
            }
        }.frame(width: size, height: size).clipShape(Circle())
            .accessibilityHidden(true)
    }
}

struct AccountToolbar: ToolbarContent {
    @Environment(AppModel.self) private var model

    var body: some ToolbarContent {
        if #available(iOS 26.0, *) {
            accountItem.sharedBackgroundVisibility(.hidden)
        } else {
            accountItem
        }
    }

    private var accountItem: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            NavigationLink(destination: AccountView()) {
                AccountAvatar(profile: model.profile, size: 36)
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
            }.buttonStyle(.plain)
                .accessibilityLabel("アカウント")
                .accessibilityIdentifier("accountButton")
        }
    }
}
